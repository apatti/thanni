/**
 * ga-train.ts — offline GA trainer for the GaAI genome.
 *
 * Evolves a `Genome` by playing thousands of full matches via the headless
 * `simulateAction` dispatcher in the engine. Fitness = average match
 * balance differential when the candidate genome's `GaAI` plays against a
 * baseline of `HeuristicAI` opponents (3 baseline seats; the candidate
 * plays all 4 seats symmetrically by rotating — see fitness eval).
 *
 * Selection: tournament size 3. Crossover: uniform per-gene. Mutation:
 * gaussian jitter with probability MUTATION_RATE per gene. Elite: top-1
 * carried over unchanged each generation.
 *
 * Output: writes the best genome to `src/ai/ga-genome.json`, which the
 * registry loads at runtime so any seat flagged 'ga' uses the trained
 * values on the next build / dev reload.
 *
 * Usage:
 *   npx tsx scripts/ga-train.ts
 *
 * Tune via the constants below; defaults are conservative (pop=20, games=10
 * per genome per generation, generations=20). Full run takes a few minutes.
 */

import {
  createInitialState,
  transitionToBiddingPhase1,
  transitionToTrumpSet,
  transitionToPlaying,
  transitionToNewRound,
  simulateAction,
  evaluateRound,
  getNextPlayerClockwise,
  getLegalCards,
  sortCards,
  type GameState,
  type PlayerId,
  type Suit,
  type Card,
} from '../thanniEngine';
import type { AIStrategy, CardplayView, BiddingView } from '../src/ai/AIStrategy';
import { DEFAULT_GENOME, GENOME_BOUNDS, clampGenome, type Genome } from '../src/ai/genome';
import { GaAI } from '../src/ai/GaAI';
import { HeuristicAI } from '../src/ai/HeuristicAI';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

// ─── GA hyperparameters ───────────────────────────────────────────────
const POP_SIZE = 12;
const GAMES_PER_GENOME = 8;
const GENERATIONS = 15;
const TOURNAMENT_SIZE = 3;
const MUTATION_RATE = 0.3;       // per-gene probability of mutation
const MUTATION_SIGMA = 0.1;      // gaussian stddev as fraction of gene range
const ELITE_COUNT = 1;           // top-N carried over unchanged
const BASELINE_SEATS: PlayerId[] = ['p0', 'p1', 'p3']; // HeuristicAI baseline
const CANDIDATE_SEATS: PlayerId[] = ['p0', 'p1', 'p2', 'p3']; // candidate plays all seats (rotating)

const GENOME_PATH = new URL('../src/ai/ga-genome.json', import.meta.url);

// ─── Helpers ──────────────────────────────────────────────────────────

function gaussian(): number {
  // Box-Muller transform — produces a single N(0,1) sample.
  const u1 = Math.random() || Number.MIN_VALUE;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function mutate(g: Genome): Genome {
  const out: Genome = { ...g };
  for (const k of Object.keys(DEFAULT_GENOME) as (keyof Genome)[]) {
    if (Math.random() < MUTATION_RATE) {
      const [lo, hi] = GENOME_BOUNDS[k];
      const range = hi - lo;
      const delta = gaussian() * MUTATION_SIGMA * range;
      out[k] = clamp(out[k] + delta, lo, hi);
    }
  }
  return clampGenome(out);
}

function crossover(a: Genome, b: Genome): Genome {
  const out: Genome = { ...DEFAULT_GENOME };
  for (const k of Object.keys(DEFAULT_GENOME) as (keyof Genome)[]) {
    out[k] = Math.random() < 0.5 ? a[k] : b[k];
  }
  return out;
}

function tournamentSelect(pop: Genome[], fitness: number[]): Genome {
  let bestIdx = -1;
  let bestFit = -Infinity;
  for (let i = 0; i < TOURNAMENT_SIZE; i++) {
    const idx = Math.floor(Math.random() * pop.length);
    if (fitness[idx] > bestFit) { bestFit = fitness[idx]; bestIdx = idx; }
  }
  return pop[bestIdx];
}

function pickTrumpSuit(bidWinnerId: PlayerId, state: GameState): { suit: Suit; card: Card | null } {
  // Pick the longest suit in the bid winner's hand; tie-break by lowest point card.
  const hand = state.players.get(bidWinnerId)?.hand ?? [];
  if (hand.length === 0) return { suit: 'HEARTS', card: null };
  const counts: Record<Suit, number> = { HEARTS: 0, DIAMONDS: 0, SPADES: 0, CLUBS: 0 };
  for (const c of hand) counts[c.suit]++;
  const best = (Object.entries(counts) as [Suit, number][])
    .sort((a, b) => b[1] - a[1] || (Math.random() - 0.5))[0][0];
  const cardsOfSuit = hand.filter(c => c.suit === best).sort((a, b) => a.pointValue - b.pointValue);
  return { suit: best, card: cardsOfSuit[0] ?? null };
}

function buildCardplayView(state: GameState, pid: PlayerId, targetTricks: number): CardplayView {
  const player = state.players.get(pid)!;
  // Compute legal cards the same way the UI does — so the strategy can only
  // pick a card the engine will accept. Honest gameplay: fullHands is empty
  // so strategies can't peek at opponents' cards through this view.
  const legal = getLegalCards(
    player.hand,
    state.trickPile,
    state.trumpSuit,
    state.trumpRevealedThisRound,
    pid,
    null, // revealingPlayerId — trainer doesn't simulate trump reveals yet
  );
  return {
    myId: pid,
    myHand: player.hand,
    legal,
    trickPile: state.trickPile,
    trump: state.trumpSuit,
    trumpOpen: state.trumpRevealedThisRound,
    partnerId: player.partnerId,
    isSoloRound: false,
    soloCallerId: null,
    foldedPartnerId: null,
    tricksRemaining: targetTricks - state.currentTrickNumber + 1,
    fullHands: new Map(),
    balance: state.balance,
    bidWinner: state.bidWinnerId,
    currentBid: state.biddingState.currentHighestBid,
  };
}

function buildBiddingView(state: GameState, pid: PlayerId): BiddingView {
  const cb = state.biddingState.currentHighestBid;
  const minNextBid = cb ? cb.amount + 10 : 150;
  return {
    myId: pid,
    myHand: state.players.get(pid)!.hand,
    currentHighestBid: cb,
    minNextBid,
    passesSinceLastBid: state.biddingState.passesSinceLastBid,
    thanniEligible: !!state.biddingState.thanniEligible[pid],
    balance: state.balance,
  };
}

function nextActor(state: GameState, currentPid: PlayerId): PlayerId {
  if (state.trickPile.length === 0) return state.currentLeadPlayerId ?? currentPid;
  const last = state.trickPile[state.trickPile.length - 1];
  return getNextPlayerClockwise(last.playerId);
}

/** Drive a full match. Returns the final signed balance (positive = RED wins). */
function playMatch(strategies: Record<PlayerId, AIStrategy>): number {
  let state = createInitialState('p1');
  state = transitionToBiddingPhase1(state);
  let safetyRounds = 0;

  while (state.status !== 'MATCH_OVER' && safetyRounds < 1500) {
    safetyRounds++;

    // ── BIDDING_PHASE1 ──
    if (state.status === 'BIDDING_PHASE1') {
      const cur = state.biddingState.currentPlayerToBid;
      const cb = state.biddingState.currentHighestBid;
      const passes = state.biddingState.passesSinceLastBid;

      // Forced Beat: engine returns forcedBidTriggered when 4 passes accumulate
      // with no current bid. simulateAction doesn't surface the flag — we detect
      // it directly and forcibly place the Beat bid, since the AI would otherwise
      // keep passing on a weak hand.
      if (!cb && passes >= 4) {
        state = simulateAction(state, { kind: 'BID', playerId: cur, amount: 150 });
        continue;
      }

      // Normal bid / pass — strategy consults.
      const choice = strategies[cur].chooseBid(buildBiddingView(state, cur));
      if (choice.kind === 'BID' && choice.amount > 0) {
        state = simulateAction(state, { kind: 'BID', playerId: cur, amount: choice.amount });
      } else {
        state = simulateAction(state, { kind: 'PASS', playerId: cur });
      }
      // Detect bidding end: ≥3 passes after someone bid → set trump + phase 2 + start play.
      const newPasses = state.biddingState.passesSinceLastBid;
      const newCb = state.biddingState.currentHighestBid;
      if (newCb && newPasses >= 3) {
        const bidWinnerId = newCb.playerId;
        state = { ...state, bidWinnerId };
        const { suit } = pickTrumpSuit(bidWinnerId, state);
        // Trainer simplification: do NOT set aside a "trump card" from the bid
        // winner's hand — the trainer doesn't simulate trump-reveal returns,
        // so removing one would leave the bid winner short a card in trick 6.
        // We just designate the bid winner's longest suit as trump and let
        // them keep all 6 cards. (The "set aside" mechanic is a UI-only nicety.)
        state = transitionToTrumpSet(state, suit);
        state = dealPhase2ForTrainer(state);
        state = transitionToPlaying(state);
      }
      continue;
    }

    // ── PLAYING ──
    if (state.status === 'PLAYING' || state.status === 'TRUMP_REVEALED') {
      const actor = nextActor(state, state.currentLeadPlayerId ?? 'p2');
      // The engine's playCard rejects plays when `currentLeadPlayerId !== playerId`.
      // Within a partial trick, we must externally set the field to the actor so
      // simulateAction PLAY succeeds. On trick completion, the engine overwrites
      // the field with the trick winner — which is exactly what we want next round.
      state = { ...state, currentLeadPlayerId: actor };
      const view = buildCardplayView(state, actor, 6);
      const pick = strategies[actor].chooseCard(view);
      state = simulateAction(state, { kind: 'PLAY', playerId: actor, card: pick });
      // Round complete: trick 6 filled (4 cards). Evaluate + start new round.
      if (state.currentTrickNumber >= 6 && state.trickPile.length === 4) {
        const r = evaluateRound(state);
        state = r.newState;
        if (process.env.GA_DEBUG) console.log(`    [round end] balance=${state.balance} status=${state.status} tricksP0=${state.players.get('p0')!.tricksWonThisRound} tricksP1=${state.players.get('p1')!.tricksWonThisRound}`);
        if (state.status === 'MATCH_OVER') break;
        // Force a new round via transitionToNewRound + transitionToBiddingPhase1
        // (engine doesn't auto-deal; we drive it explicitly).
        state = { ...state, status: 'ROUND_SCORED' };
        state = transitionToNewRound(state);
        state = transitionToBiddingPhase1(state);
      }
      continue;
    }

    // Anything else (LOBBY / BIDDING_PHASE2 / ROUND_SCORED / etc.) — break to avoid infinite loops.
    break;
  }

  return state.balance;
}

function dealPhase2ForTrainer(state: GameState): GameState {
  const remaining = state.remainingDeck;
  if (remaining.length < 8) return state;
  const players = new Map(state.players);
  const dealerIndex = parseInt(state.dealerId.replace('p', ''));
  const reordered: PlayerId[] = ['p0', 'p1', 'p2', 'p3'];
  const dealOrder = [
    reordered[(dealerIndex + 1) % 4], reordered[(dealerIndex + 2) % 4],
    reordered[(dealerIndex + 3) % 4], reordered[(dealerIndex + 4) % 4],
    reordered[(dealerIndex + 1) % 4], reordered[(dealerIndex + 2) % 4],
    reordered[(dealerIndex + 3) % 4], reordered[(dealerIndex + 4) % 4],
  ];
  let i = 0;
  for (const pid of dealOrder) {
    const player = players.get(pid)!;
    const newCard = remaining[i++];
    players.set(pid, { ...player, hand: sortCards([...player.hand, newCard]) });
  }
  return { ...state, players, remainingDeck: [] };
}

// ─── Fitness evaluation: candidate team vs baseline team ───────────────
// A candidate genome G plays on seats p0+p2 (one team); the HeuristicAI
// baseline plays on seats p1+p3 (the other team). Fitness = average final
// balance (positive = candidate's RED team won, negative = baseline won).
// Since p0+p2 always plays the candidate, positive fitness means the
// candidate reliably beats the baseline — the GA evolves "good play".
//
// Self-play (same genome on all 4 seats) would oscillate around 0 by symmetry
// and never produce meaningful selection pressure, so we use the asymmetric
// setup. To remove the RED-team bias (RED always plays the candidate), we
// could alternate the candidate's team each game, but for simplicity we keep
// it fixed — the GA still learns "how to play well alongside a partner who
// also plays well" since both candidate seats use the same genome.

function evaluateFitness(genome: Genome): number {
  const ai = new GaAI(genome);
  const baseline = new HeuristicAI();
  const strategies: Record<PlayerId, AIStrategy> = {
    p0: ai,    // RED — candidate
    p1: baseline, // BLACK — baseline
    p2: ai,    // RED — candidate
    p3: baseline, // BLACK — baseline
  };
  let sum = 0;
  for (let g = 0; g < GAMES_PER_GENOME; g++) {
    const finalBalance = playMatch(strategies);
    // Positive balance = RED (candidate) leads → reward.
    sum += finalBalance;
  }
  return sum / GAMES_PER_GENOME;
}

// ─── Main GA loop ─────────────────────────────────────────────────────

function main() {
  console.log('═══ Thanni GA Trainer ═══');
  console.log(`pop=${POP_SIZE} games=${GAMES_PER_GENOME} gens=${GENERATIONS} tournament=${TOURNAMENT_SIZE} mutation=${MUTATION_RATE} sigma=${MUTATION_SIGMA}`);

  // Seed population: jitter DEFAULT_GENOME for diversity (pop size).
  let population: Genome[] = [];
  for (let i = 0; i < POP_SIZE; i++) {
    population.push(i === 0 ? DEFAULT_GENOME : mutate(DEFAULT_GENOME));
  }

  // Optionally warm-start from an existing trained genome.
  if (existsSync(GENOME_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(GENOME_PATH, 'utf8')) as Genome;
      population[0] = clampGenome({ ...DEFAULT_GENOME, ...existing });
      console.log('warm-started from existing ga-genome.json');
    } catch { /* ignore — start fresh */ }
  }

  for (let gen = 0; gen < GENERATIONS; gen++) {
    const t0 = Date.now();
    console.log(`\n── gen ${gen + 1}/${GENERATIONS} ──`);

    // Evaluate every genome.
    const fitness = population.map((g, i) => {
      const f = evaluateFitness(g);
      if (Number.isNaN(f) || !Number.isFinite(f)) return -Infinity;
      return f;
    });

    // Sort by fitness descending.
    const ranked = population.map((g, i) => ({ g, f: fitness[i] }))
      .sort((a, b) => b.f - a.f);
    const best = ranked[0];
    const median = ranked[Math.floor(ranked.length / 2)];
    console.log(`  best fitness = ${best.f.toFixed(2)} | median = ${median.f.toFixed(2)} | ${(Date.now() - t0)}ms`);
    console.log(`  best genome: leadHighest=${best.g.leadHighest.toFixed(2)} beatPolicy=${best.g.oppWinningBeatPolicy.toFixed(2)} projection=${best.g.projectionFactor.toFixed(2)} conf=${best.g.confidenceThreshold.toFixed(2)} conc4=${best.g.concentrationBonus4.toFixed(1)} conc3=${best.g.concentrationBonus3.toFixed(1)}`);

    // Save the best-so-far genome each generation if it improved (gen 0 always saves).
    if (gen === 0 || best.f > bestFitnessSoFar) {
      bestFitnessSoFar = best.f;
      writeFileSync(GENOME_PATH, JSON.stringify(best.g, null, 2) + '\n');
      console.log(`  → wrote best genome to src/ai/ga-genome.json`);
    }

    // Build next generation.
    const next: Genome[] = [];
    // Elite: carry top-N unchanged.
    for (let i = 0; i < ELITE_COUNT && i < ranked.length; i++) next.push(ranked[i].g);
    // Fill the rest via tournament selection + crossover + mutation.
    while (next.length < POP_SIZE) {
      const a = tournamentSelect(population, fitness);
      const b = tournamentSelect(population, fitness);
      const child = mutate(crossover(a, b));
      next.push(child);
    }
    population = next;
  }

  // Final summary.
  console.log('\n═══ Training complete ═══');
  const saved = JSON.parse(readFileSync(GENOME_PATH, 'utf8')) as Genome;
  console.log('final genome saved to src/ai/ga-genome.json:');
  console.log(JSON.stringify(saved, null, 2));
}

let bestFitnessSoFar = -Infinity;

main();