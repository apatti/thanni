/**
 * GaAI.ts — AIStrategy impl parameterized by a Genome.
 *
 * `GaAI(DEFAULT_GENOME)` reproduces HeuristicAI's behavior byte-for-byte —
 * a starting-point artifact. Offline training via `scripts/ga-train.ts`
 * evolves the genome; the trained artifact is saved to
 * `src/ai/ga-genome.json` and loaded at runtime by the registry.
 *
 * Cardplay reimplements aiPickCard's structure but with genome-tunable
 * decision thresholds (lead high vs low, beat cheap vs strong, etc.).
 * Bidding reimplements evaluateHand's bonus table + projection factor +
 * confidence threshold using genome-tunable values.
 */

import type { AIStrategy, CardplayView, BiddingView, BidChoice } from './AIStrategy';
import type { Card, Suit } from '../../thanniEngine';
import { MAX_BID, MIN_BEAT } from '../../thanniEngine';
import { winningOfPile } from '../../thanniAI';
import { DEFAULT_GENOME, clampGenome, type Genome } from './genome';

export class GaAI implements AIStrategy {
  readonly name = 'GaAI';
  private readonly genome: Genome;

  constructor(genome: Partial<Genome> = DEFAULT_GENOME) {
    this.genome = clampGenome({ ...DEFAULT_GENOME, ...genome });
  }

  /** Expose the genome for inspection / logging. */
  getGenome(): Genome { return { ...this.genome }; }

  chooseCard(view: CardplayView): Card {
    const legal = view.legal;
    if (legal.length === 1) return legal[0];

    const { isSoloRound, trickPile, partnerId } = view;
    const trumpOpen = isSoloRound ? false : view.trumpOpen;
    const trump = isSoloRound ? null : view.trump;
    const byPtsDesc = (a: Card, b: Card) => b.pointValue - a.pointValue;

    // ── Leading a new trick ──
    if (trickPile.length === 0) {
      const nonTrump = trump ? legal.filter(c => c.suit !== trump) : legal;
      const pool = nonTrump.length ? nonTrump : legal;
      const sortedDesc = pool.slice().sort(byPtsDesc);
      // Genome threshold: leadHighest >= 0.5 → highest; else lowest.
      return this.genome.leadHighest >= 0.5 ? sortedDesc[0] : sortedDesc[sortedDesc.length - 1];
    }

    // ── Following ──
    const curBest = winningOfPile(trickPile, trumpOpen, trump);
    const partnerWinning = curBest != null && curBest.playerId === partnerId;

    if (partnerWinning) {
      const sortedDesc = legal.slice().sort(byPtsDesc);
      return this.genome.partnerWinningDumpCheapest >= 0.5
        ? sortedDesc[sortedDesc.length - 1] // cheapest — default
        : sortedDesc[0];                     // highest
    }

    // Opponent winning → try to beat with the cheapest/strength beater.
    const beaters = legal.filter(c => {
      if (!curBest) return false;
      const curIsTrump = trumpOpen && trump != null && curBest.card.suit === trump;
      const isTrump = trumpOpen && trump != null && c.suit === trump;
      if (isTrump && !curIsTrump) return true;
      if (isTrump && curIsTrump) return c.pointValue > curBest.card.pointValue;
      if (!curIsTrump && c.suit === curBest.card.suit && c.pointValue > curBest.card.pointValue) return true;
      return false;
    });

    if (beaters.length) {
      const sortedDesc = beaters.slice().sort(byPtsDesc);
      return this.genome.oppWinningBeatPolicy >= 0.5
        ? sortedDesc[sortedDesc.length - 1] // cheapest beater — default
        : sortedDesc[0];                     // strongest beater
    }

    // Cannot beat → dump.
    const sortedDesc = legal.slice().sort(byPtsDesc);
    return this.genome.oppWinningDumpPolicy >= 0.5
      ? sortedDesc[sortedDesc.length - 1] // cheapest — default
      : sortedDesc[0];                     // highest
  }

  chooseBid(view: BiddingView): BidChoice {
    const hand = view.myHand;

    // Reimplement evaluateHand with genome-tunable bonuses.
    let rawPointTotal = 0;
    let highCardCount = 0;
    const suitDist = new Map<Suit, number>();
    for (const c of hand) {
      rawPointTotal += c.pointValue;
      if (c.value === 'A' || c.value === 'K' || c.value === 'Q') highCardCount++;
      suitDist.set(c.suit, (suitDist.get(c.suit) ?? 0) + 1);
    }
    let adjustedScore = rawPointTotal;
    const maxSuitCount = Math.max(0, ...Array.from(suitDist.values()));
    if (maxSuitCount >= 4) adjustedScore += this.genome.concentrationBonus4;
    else if (maxSuitCount >= 3) adjustedScore += this.genome.concentrationBonus3;
    if (highCardCount >= 4) adjustedScore += this.genome.highCardBonus4;
    else if (highCardCount >= 3) adjustedScore += this.genome.highCardBonus3;
    adjustedScore = Math.min(adjustedScore, MAX_BID);

    const projectedPoints = Math.round(adjustedScore * this.genome.projectionFactor);
    const minA = view.currentHighestBid ? view.currentHighestBid.amount + 10 : MIN_BEAT;
    const effectiveMinA = Math.round(minA * this.genome.confidenceThreshold);

    if (projectedPoints >= effectiveMinA && effectiveMinA <= MAX_BID) {
      const bidAmt = Math.max(effectiveMinA, Math.ceil(projectedPoints / 10) * 10);
      if (bidAmt <= MAX_BID) return { kind: 'BID', amount: Math.min(bidAmt, MAX_BID) };
    }
    return { kind: 'PASS' };
  }
}