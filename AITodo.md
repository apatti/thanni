# AI Strategy Roadmap

This document explains the **pluggable AI strategy architecture** in this repo and outlines the strategies you can implement later. Each strategy is a self-contained module that plugs into the existing per-seat registry — no UI or engine changes required to add a new one.

## Table of Contents

- [Architecture overview](#architecture-overview)
- [Existing strategies](#existing-strategies)
- [Strategy ideas to implement later](#strategy-ideas-to-implement-later)
  - [1. MCTS (Monte Carlo Tree Search)](#1-mcts-monte-carlo-tree-search)
  - [2. GA (Genetic Algorithm — already scaffolded)](#2-ga-genetic-algorithm--already-scaffolded)
  - [3. Expectimax with hand inference](#3-expectimax-with-hand-inference)
  - [4. Reinforcement learning (DQN / PPO)](#4-reinforcement-learning-dqn--ppo)
  - [5. Rule-based expert system with void-tracking](#5-rule-based-expert-system-with-void-tracking)
  - [6. Hybrid: MCTS playout policy = GA genome](#6-hybrid-mcts-playout-policy--ga-genome)
- [Adding a new strategy — checklist](#adding-a-new-strategy--checklist)
- [Measuring strategy strength](#measuring-strategy-strength)
- [Engine primitives available to strategies](#engine-primitives-available-to-strategies)

---

## Architecture overview

The AI surface lives under `src/ai/`. Key files:

| File | Role |
|---|---|
| `src/ai/AIStrategy.ts` | The `AIStrategy` interface (methods `chooseCard(view)` + `chooseBid(view)`) plus the `CardplayView` / `BiddingView` types that strategies consume. |
| `src/ai/HeuristicAI.ts` | Reference impl wrapping the existing `aiPickCard` heuristic. Byte-identical to the pre-refactor behavior. |
| `src/ai/GaAI.ts` | Genome-parameterized impl. Uses tunable weights in `chooseCard` / `chooseBid`. |
| `src/ai/genome.ts` | `Genome` interface + `DEFAULT_GENOME` + `clampGenome`. |
| `src/ai/ga-genome.json` | Trained artifact loaded by the registry. Overwritten by `scripts/ga-train.ts`. |
| `src/ai/featureFlag.ts` | Per-seat `Record<PlayerId, 'legacy' \| 'heuristic' \| 'mcts' \| 'ga'>` with `localStorage` persistence. |
| `src/ai/registry.ts` | Maps strategy names → impl instances. **Edit this when you add a new strategy**. |
| `src/ai/index.ts` | Barrel re-exporting the types + helpers above. |
| `src/AIModeDropdown.tsx` | Hidden debug dropdown in the header — per-seat strategy selector + "Reset to default". |
| `scripts/ga-train.ts` | Offline GA trainer. Uses `simulateAction` to play full matches headlessly. |

### Decision flow in the UI

```
AI seat (p0/p1/p3) is about to act
  ↓
Read feature flag: getAISeatMode(seat) === ?
  ├── 'legacy'   → call aiPickCard / inline bidding heuristic directly (byte-identical pre-refactor behavior, zero indirection)
  └── other       → call getAIStrategy(seat).chooseCard/chooseBid(view) where view is built by buildCardplayView / buildBiddingView
```

**Thanni and Hath Band call decisions are NOT routed through strategies** — they remain on dedicated heuristics (`aiShouldBidThanni`, `aiShouldCallHathBand`) that short-circuit before the strategy is consulted. Strategies never see those decisions. If you want to make solo-call decisions pluggable too, add `chooseThanni(view)` / `chooseHathBand(view)` to `AIStrategy` and consult them in the Thanni / Hath Band UI effects.

### Headless engine driver

The engine exposes a pure `simulateAction(state, action): GameState` dispatcher (`thanniEngine.ts`) covering `PLAY`, `PASS`, `BID`, `BID_THANNI`, `CALL_HATH_BAND`, `SET_TRUMP`, `REVEAL_TRUMP`. Illegal actions return the input state unchanged (detectable via reference equality). This is the canonical MCTS / GA rollout primitive — no React, no `setTimeout`, side-effect-free.

The UI loop does NOT use `simulateAction` for live play — it uses `evaluateTrickWithContext` directly and React state. The two paths share the engine's primitives (`getLegalCards`, `evaluateTrickWithContext`, `applyRoundScoring`) but not the loop structure. Strategies can use `simulateAction` for hypothetical rollouts on a deterministic copy.

---

## Existing strategies

### `legacy`
- Bypasses the strategy registry entirely. UI calls `aiPickCard` + the inline bidding heuristic directly.
- Byte-identical to pre-refactor behavior; zero indirection cost.
- This is the default for every seat (`DEFAULT_MODE = { p0: 'legacy', p1: 'legacy', p2: 'legacy', p3: 'legacy' }`).

### `heuristic`
- Routes through `getAIStrategy()` → `HeuristicAI`.
- `HeuristicAI.chooseCard` delegates to `aiPickCard`.
- `HeuristicAI.chooseBid` replicates the inline bidding heuristic (4-card eval × 1.5 projection → min-raise-of-10).
- Indistinguishable from `legacy` today; the indirection is paid for the option to swap later.

### `mcts` (placeholder)
- Returns HeuristicAI. Reserved for `MctsAI` (see [§1 below](#1-mcts-monte-carlo-tree-search)).

### `ga` (implemented; scaffold + trainer ready)
- `GaAI` loads a `Genome` from `src/ai/ga-genome.json` and uses genome-tunable weights in `chooseCard` / `chooseBid`.
- Offline trainer: `scripts/ga-train.ts` runs a standard GA loop (tournament selection, gaussian mutation, uniform crossover, elite carry-over) using `simulateAction` for full-match rollouts.
- Default genome = `DEFAULT_GENOME` (matches HeuristicAI's hardcoded numbers) so untrained `GaAI` ≡ `HeuristicAI` byte-for-byte.
- See [§2 below](#2-ga-genetic-algorithm--already-scaffolded) for training guidance.

---

## Strategy ideas to implement later

### 1. MCTS (Monte Carlo Tree Search)

**Concept.** Each decision is the root of a search tree. Repeatedly:
1. **Selection** — traverse the tree using UCB1 until reaching an unexpanded node.
2. **Expansion** — add a child node for one legal action.
3. **Simulation (rollout)** — play random (or lightly-heuristic) moves to terminal; record the payoff.
4. **Backpropagation** — propagate the payoff up to the root; track visit counts + mean values.

After N rollouts, pick the action with the highest mean value (or most visits).

**Why it fits this game.**
- 24-card deck, low branching factor (~6 legal moves per turn).
- Full match ≤ ~150 decisions; MCTS can run thousands of rollouts in <500ms.
- `simulateAction` gives you a pure `GameState → GameState` primitive — no React/ui concerns.

**Information-set challenge.** MCTS is perfect-info; Thanni is imperfect-info (you see only your hand). Two standard options:
1. **Information Set MCTS (ISMCTS)** — for each rollout, determinize the unseen portion of opponents' hands (sample a random partition of the unseen cards consistent with the bids/play so far). Run perfect-info MCTS on that determinization. Repeat across many determinizations. Pick the action with the best average value.
2. **Open-loop MCTS** — don't track hidden state in the tree; only track the visible game state and your actions. Rollouts sample the hidden state fresh each iteration. Simpler; slightly less statistically efficient.

**Files to add.**
- `src/ai/MctsAI.ts` — the impl (see skeleton below).
- (Optional) `src/ai/MctsNode.ts` — node class with UCB1 + child tracking. Can be inlined.

**Skeleton.**
```typescript
import type { AIStrategy, CardplayView, BiddingView, BidChoice } from './AIStrategy';
import type { Card, GameState, PlayerId } from '../thanniEngine';
import { simulateAction, getLegalCards, evaluateRound, type GameAction } from '../thanniEngine';
import { HeuristicAI } from './HeuristicAI';

const ROLLOUTS_PER_TURN = 1000;          // tune for time budget
const EXPLORATION_C = Math.SQRT_2;       // UCB1 exploration constant
const MAX_SIM_TICKS = 1500;              // safety cap on simulate

export class MctsAI implements AIStrategy {
  readonly name = 'MctsAI';
  private readonly rolloutPolicy: AIStrategy; // playout heuristic — random or HeuristicAI

  constructor(rolloutPolicy?: AIStrategy) {
    this.rolloutPolicy = rolloutPolicy ?? new HeuristicAI();
  }

  chooseCard(view: CardplayView): Card {
    if (view.legal.length === 1) return view.legal[0];

    // Build a perfect-info GameState from the view. Determinize the unseen
    // portion for ISMCTS by re-shuffling view.fullHands — but the UI passes
    // fullHands already filled; for ISMCTS you must determinize before constructing
    // the view. Simplest: use the engine's actual GameState as the perfect-info
    // root (you'll need to plumb that through the view, OR reconstruct from view).
    //
    // Recommendation: extend CardplayView with a `rootState: GameState` field
    // carrying the engine's live state at decision time (read-only). Then
    // MctsAI can determinize from it on each rollout.

    // ... tree search loop:
    //   for rollout in 0..ROLLOUTS_PER_TURN:
    //     state = determinize(rootState)           // ISMCTS
    //     leaf = select+expand(tree, state)
    //     payoff = simulate(state with rolloutPolicy)
    //     backprop(leaf, payoff)
    //   return child of root with highest mean value
    throw new Error('MctsAI not implemented — see AITodo.md §1');
  }

  chooseBid(view: BiddingView): BidChoice {
    // Same idea: search over bid choices. Bids are discrete (PASS, 150/160/…/328),
    // so the tree is narrow but deep (each bid expands into 3-passes-then-bid
    // child states until bidding completes + a full playdown).
    // Bidding MCTS is expensive; many bots use a heuristic with hand eval here.
    throw new Error('MctsAI.chooseBid not implemented — see AITodo.md §1');
  }
}
```

**Plumbing needed in the view.** MctsAI needs the engine's actual `GameState` at decision time so it can determinize / simulate. The cleanest approach: add `rootState: GameState` to `CardplayView` and `BiddingView`. The UI's `buildCardplayView` already has access to the full React state (and `liveHandsMap`); just thread it through. This is a small engine + UI change but doesn't break any existing strategy (HeuristicAI / GaAI simply ignore the new field).

**Time budget.** A typical browser AI tick is 600–1400ms (current heuristic delay in `ThanniGame.tsx`). Aim for ~500ms of compute per `chooseCard` call. With `simulateAction` at ~5μs per tick and ~150 ticks per match, that's ~700 rollouts per call in 500ms. Tune `ROLLOUTS_PER_TURN` against actual perf.

**Tests to add.**
- ChooseCard returns a legal card.
- ChooseCard on a trivially-winning position (caller holds all remaining top cards) picks the winning card.
- ChooseBid on a 4-Jacks hand bids, not passes.

---

### 2. GA (Genetic Algorithm — already scaffolded)

The runtime (`GaAI`) and trainer (`scripts/ga-train.ts`) are implemented. What's left is **tuning the trainer** (offline) and **expanding the genome** to be more expressive.

**Genome expansion ideas.**
- Add **per-suit bias weights** (prefer leading ♥ over ♠, etc.). 4 genes.
- Add **bid-step tuning** (the current `Math.ceil(projectedPoints / 10) * 10` is hardcoded to step 10) — make the genome pick round-up denominator from {10, 15, 20, 25}.
- Add **Thanni-call threshold** (`chooseThanni` if confidence ≥ X AND sweep check passes). Requires extending `AIStrategy` — see "Thanni / Hath Band decision-making" below.
- Add **opponent-modeling genes** — e.g., dump high cards when the trick pile already contains the bid winner's lead (saves points).

**Training schedule.**
1. Run `npx tsx scripts/ga-train.ts` with conservative hyperparameters (`POP_SIZE=12`, `GAMES_PER_GENOME=8`, `GENERATIONS=15`) — ~3 seconds per full run with the default genome.
2. If the fitness curve plateaus, increase `GAMES_PER_GENOME` (signal quality) or `POP_SIZE` (diversity). Try `MUTATION_SIGMA = 0.05` for fine-tuning near a converged optimum.
3. The trainer writes the best genome to `src/ai/ga-genome.json` each generation it improves. Restart the dev server to load the new artifact (Vite's JSON import is cached).
4. To restart from scratch with random init: delete `ga-genome.json`, change `population[0] = DEFAULT_GENOME` in `scripts/ga-train.ts` to `mutate(DEFAULT_GENOME)`.

**Fitness function caveats.**
- The current fitness is "candidate (RED, p0+p2) vs baseline (BLACK, p1+p3) → average final balance." This has a **RED-TEAM BIAS** — every match the candidate plays on the same seats. To remove it, alternate the candidate's team each game (odd games: candidate on BLACK). Worth doing before any serious training; trivial fix in `evaluateFitness`.
- Self-play (candidate on all 4 seats) — DON'T. Symmetric matchup → balance oscillates around 0 → no selection pressure. Always evaluate against a different baseline (HeuristicAI is the natural one).

**Thanni / Hath Band decision-making.** Currently hardcoded to heuristics (`aiShouldBidThanni`, `aiShouldCallHathBand`). To GA-tune them:
1. Add `chooseThanni(view): boolean` and `chooseHathBand(view): boolean` to `AIStrategy`.
2. Update the UI's Thanni / Hath Band effects to consult `getAIStrategy(seat)` if the seat is non-`legacy`; else fall back to the heuristic.
3. Add genes controlling the thresholds (e.g., `minJacksForThanni`, `minHandStrengthForHathBand`).
4. Add a small bonus to the GA fitness when the candidate makes a successful solo bid (encourages the GA to learn good solo-call thresholds).

---

### 3. Expectimax with hand inference

**Concept.** A shallower, more explanation-friendly search than MCTS. At each decision, branch over all legal actions; for each action, branch over a *distribution* of likely opponent responses (using a hand-strength heuristic instead of pure random); pick the action maximizing expected value.

**Why it might be interesting here.**
- Avoids the "thousands of rollouts" cost of MCTS; runs in O(branching × depth) — fast.
- Hand inference: track which suits opponents have shown void-in (didn't follow suit earlier in the round) and update beliefs. Reduces the unseen-card state space.

**Files to add.**
- `src/ai/ExpectimaxAI.ts`.
- `src/ai/BeliefState.ts` — tracks "probability that player P holds card C" given the bids/tricks so far. Updated via Bayes on each observable action.

**Skeleton (sketch).**
```typescript
export class ExpectimaxAI implements AIStrategy {
  readonly name = 'ExpectimaxAI';
  chooseCard(view: CardplayView): Card {
    const belief = BeliefState.fromView(view); // opponent-hand distribution
    let best: Card | null = null;
    let bestEV = -Infinity;
    for (const candidate of view.legal) {
      const ev = this.evaluateCard(candidate, view, belief, depth=4);
      if (ev > bestEV) { bestEV = ev; best = candidate; }
    }
    return best!;
  }
  // ...
}
```

**Where to put effort.** Belief-state tracking is ~70% of the work. Card evaluation via shallow search is ~30%. Borrowing MCTS's insight: a depth-3 expectimax with a good belief model often beats a depth-9 expectimax with a bad one.

---

### 4. Reinforcement learning (DQN / PPO)

**Concept.** Train a neural network that maps `(obs, action) → value` (or `obs → action distribution`). Use self-play or play-vs-baseline to generate training data; gradient updates via backprop.

**Why this is a bigger lift.**
- Need an agent training framework (or roll your own with `@tensorflow/tfjs` / `onnxruntime-web`).
- Browser inference cost is real — must keep model size < ~100KB to fit a 60fps budget.
- Reward shaping is tricky in trick-taking (sparse rewards: only at end of round / match).
- The engine's `simulateAction` is fast in Node but slow in a Python notebook; you'd train offline in Python (exporting the engine via a JS bridge) or with `tfjs-node`.

**Files to add.**
- `src/ai/RLAI.ts` — runtime inference (loads a pretrained `.onnx` or `.json` model via `fetch`).
- A Python (or pure-JS) training script under `scripts/rl/` — uses `simulateAction` to generate training games, applies DQN/PPO updates.

**Where to start.** Begin with `tfjs-node` + DQN on cardplay only (small action space ≤ 6). Don't try to learn bidding until cardplay is decent. Reward = trick points captured per trick (dense reward shaping).

---

### 5. Rule-based expert system with void-tracking

**Concept.** The current `HeuristicAI` is rule-based but doesn't track which opponents are void in which suits across tricks. A simple upgrade: maintain a per-round `voidInSuit[seat][suit]` boolean matrix; update on each "didn't follow led suit" observation; use it to:
- Lead suits opponents are known void in (forces them to discard, can't win).
- Avoid leading suits your partner is void in (could be ruffed).

**Why it's a good first project.**
- No engine change; the strategy has all the info it needs from `view.trickPile` + `view.tricksRemaining` + the played-card history you can thread through the view.
- Beats `HeuristicAI` straight-up; modest complexity.

**Files to add.**
- `src/ai/ExpertAI.ts`.
- `src/ai/VoidTracker.ts` — pure helper class.

**Plumbing needed.** Add a `trickHistory: PlayedCard[]` to `CardplayView` (currently `view.trickPile` only has the current trick). The UI's `buildCardplayView` has access to the `results` array; thread it through.

---

### 6. Hybrid: MCTS playout policy = GA genome

**Concept.** MCTS rollouts use a random playout by default. Using a *trained* `GaAI` genome as the rollout policy makes rollouts much more accurate — the search converges faster with fewer rollouts.

**Why it works.** The GA learns a "decent baseline heuristic"; MCTS then explores the deviations. Two trained artifacts combined via search ≈ both, leveraged.

**Files to add.** None — instantiate `MctsAI(rolloutPolicy = new GaAI(trainedGenome))`. The `MctsAI` constructor already accepts an `AIStrategy` for rollouts.

---

## Adding a new strategy — checklist

To plug in a new strategy (call it `FooAI`):

1. **Create the file**: `src/ai/FooAI.ts`. Implement the `AIStrategy` interface — `chooseCard(view)` and `chooseBid(view)`. Import any helpers you need from `../../thanniEngine` and `./AIStrategy`.

2. **Add the strategy name to the type**: `src/ai/featureFlag.ts`'s `AIStrategyName`. Add your name (`'foo'`). Update `DEFAULT_MODE` if you want it as the default.

3. **Wire the registry**: `src/ai/registry.ts`'s `impls` map. Add `foo: new FooAI()`. Update the import at the top.

4. **(Optional) Add to the dropdown**: `src/AIModeDropdown.tsx`'s `<select>` list. Add `<option value="foo">foo</option>`.

5. **Add tests** to `scripts/thanni-smoke.ts`: at minimum, verify `FooAI.chooseCard` returns a legal card and `FooAI.chooseBid` returns a valid choice.

6. **Verify**: `npx tsc --noEmit -p tsconfig.json`, `npm run build`, `npx tsx scripts/thanni-smoke.ts`.

7. **A/B test in the browser**: open the dev server, click "AI Mode" in the header, set `p0: foo` (or another seat), play hands and observe. Toggle the badge to see which seat is on which strategy.

That's it — no UI or engine changes needed.

---

## Measuring strategy strength

For a fair A/B comparison of two strategies:
1. Add a `scripts/head-to-head.ts` (modeled on `ga-train.ts`'s `playMatch`) that plays N matches with strategy X on RED and strategy Y on BLACK, then N matches with X on BLACK and Y on RED (removes team bias).
2. Report:
   - Average balance (`>0` favors X; `<0` favors Y).
   - Win rate (`balance > 0` → X win; `<0` → Y win; `=0` → tie).
   - Average tricks per round per team.
   - Average match length in safety-rounds (lower = more decisive).
3. Strive for at least N=200 games for a robust estimate (with `simulateAction` at ~5μs/tick and ~150 ticks/match, 200 games = ~3 minutes).

A `scripts/head-to-head.ts` sketch:
```typescript
import { createInitialState, transitionToBiddingPhase1, /* … */ } from '../thanniEngine';
import { HeuristicAI } from '../src/ai/HeuristicAI';
import { GaAI } from '../src/ai/GaAI';
import { DEFAULT_GENOME } from '../src/ai/genome';

const strategiesX = new GaAI(/* loaded genome */);
const strategiesY = new HeuristicAI();

function run HeadsUp(n: number): void {
  let xWins = 0, yWins = 0, ties = 0;
  let sumBal = 0;
  for (let i = 0; i < n; i++) {
    const xRed = i % 2 === 0; // alternate teams
    const strategies = xRed
      ? { p0: strategiesX, p1: strategiesY, p2: strategiesX, p3: strategiesY }
      : { p0: strategiesY, p1: strategiesX, p2: strategiesY, p3: strategiesX };
    // (For the asymmetric team setup, p0+p2 always plays one strategy, p1+p3 the other;
    //  alternating rows of `strategies` flips which strategy is on RED.)
    const finalBalance = playMatch(strategies);
    sumBal += xRed ? finalBalance : -finalBalance;
    if (finalBalance === 0) ties++;
    else if ((finalBalance > 0) === xRed) xWins++;
    else yWins++;
  }
  console.log(`X wins: ${xWins}, Y wins: ${yWins}, ties: ${ties}, mean balance (X-RED bias corrected): ${sumBal/n}`);
}
```

Borrow `playMatch` + helpers directly from `scripts/ga-train.ts` — they're independent of the training loop.

---

## Engine primitives available to strategies

Strategies are pure functions over `CardplayView` / `BiddingView`. To run hypothetical rollouts, use these engine helpers (all in `thanniEngine.ts`):

| Helper | Signature | Purpose |
|---|---|---|
| `simulateAction` | `(state, action) → state` | Apply an action headlessly. Returns the input state if illegal (compare references). |
| `getLegalCards` | `(hand, pile, trumpSuit, trumpRevealed, playerId, revealingPlayerId) → Card[]` | Compute legal plays. |
| `evaluateTrickWithContext` | `(pile, trumpSuit) → TrickResult` | Resolve a 3- or 4-card trick to its winner. |
| `applyRoundScoring` | `(state, biddingTeam, actualPoints) → RoundScoringResult` | Compute the differential balance shift without mutating state. |
| `evaluateRound` | `(state) → GameActionResult` | Full round evaluation — applies scoring to a state, returns a new state. |
| `transitionToBiddingPhase1`, `transitionToTrumpSet`, `transitionToPlaying`, `transitionToThanniPlaying`, `transitionToHathBandPlaying`, `transitionToNewRound` | `(state[, ...]) → state` | State transitions. |
| `getNextPlayerClockwise` | `(playerId, offset?) → PlayerId` | Seat rotation. |
| `getBiddingTeam` | `(bidWinnerId, players) → Team` | Bidder's team. |
| `getPartnerId` | `(playerId, players) → PlayerId` | Partner lookup. |
| `isGuaranteedSweep` / `isHathBandGuaranteedSweep` | `(hand[, allHands]) → boolean` | Solo-bid sweep pre-check. |
| `MATCH_GOAL`, `MAX_BID`, `MIN_BEAT`, `THANNI_*`, `HATH_BAND_*` | constants | Game parameters. |
| `Card`, `Suit`, `GameState`, `PlayedCard`, `GameAction`, `PlayerId`, `Team`, `Bid`, `TrickResult` | types | Engine types. |

For pure game-theoretic analysis without the engine's state model, use `buildDeck` + `shuffleDeck` to synthesize deck distributions, then call `simulateAction` directly on a `createInitialState` derivative.

---

## Final notes

- The architecture is intentionally permissive: any pure function implementing `chooseCard` + `chooseBid` plugs in. You can mix and match (e.g., `MctsAI` for cardplay, `GaAI` for bidding — by composing two strategies into one wrapper that delegates each method to its inner strategy).
- All strategies are pure; no side effects. Strategies should never touch React state, DOM, or the singleton feature flag directly. Configuration (e.g., the trained genome for `GaAI`) is constructor-injected.
- If a strategy needs shared state across a single match (e.g., `ExpertAI`'s `VoidTracker`), keep it as instance state on the strategy object and reset via `getGenome()`-style accessors OR document that the strategy object should be reconstructed per match.
- The hidden AI Mode dropdown + the visible badge make A/B testing trivial — power users can compare strategies in real time without redeploying.

Happy hunting. The first strategy to implement should be whichever aligns with your learning goals: `MctsAI` for search, `ExpertAI` for rulecraft, `RLAI` for ML — they all plug into the same surface.