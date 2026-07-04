/**
 * Thanni AI — Bidding & Gameplay Intelligence for AI Players
 *
 * This module contains all the heuristics used by computer-controlled
 * players:
 *  - Hand evaluation + bid suggestion (bidding AI)
 *  - Trick-winning card selection (gameplay AI)
 *  - Dealer-rotation intelligence (trailing-team keeps dealing)
 *
 * Pure functions only — no React, no side effects. All types are imported
 * from `./thanniEngine` so the AI stays decoupled from the UI layer.
 */

import {
  Card,
  Suit,
  PlayedCard,
  Bid,
  Team,
  MAX_BID,
  MIN_BEAT,
  getNextPlayerClockwise,
} from './thanniEngine';

// ============================================================================
// SECTION 1: BIDDING AI — Evaluate hands and suggest bid amounts
// ============================================================================

/**
 * Hand evaluation result from AI bidder perspective.
 */
export interface HandEvaluation {
  rawPointTotal: number;
  adjustedScore: number;
  highCardCount: number; // A, K, Q
  trumpStrength: number; // Points in potential trump suit
  suitDistribution: Map<Suit, number>;
  estimatedPoints: number;
}

/**
 * Evaluate a player's hand for bidding purposes.
 * Per PRD Section 5.2: Calculates raw points, applies bonuses for concentration
 * and high cards, returns estimated point total.
 */
export function evaluateHand(hand: Card[]): HandEvaluation {
  let rawPointTotal = 0;
  let highCardCount = 0;
  const suitDistribution = new Map<Suit, number>();

  for (const card of hand) {
    rawPointTotal += card.pointValue;
    if (['A', 'K', 'Q'].includes(card.value)) {
      highCardCount++;
    }
    suitDistribution.set(
      card.suit,
      (suitDistribution.get(card.suit) || 0) + 1,
    );
  }

  // Adjust for hand composition
  let adjustedScore = rawPointTotal;

  // Bonus for concentration in one suit (potential trump suit)
  const maxSuitCount = Math.max(...Array.from(suitDistribution.values()));
  if (maxSuitCount >= 4) {
    adjustedScore += 15;
  } else if (maxSuitCount >= 3) {
    adjustedScore += 8;
  }

  // Bonus for multiple high cards
  if (highCardCount >= 4) {
    adjustedScore += 10;
  } else if (highCardCount >= 3) {
    adjustedScore += 5;
  }

  // Cap at max possible points in play
  adjustedScore = Math.min(adjustedScore, MAX_BID);

  return {
    rawPointTotal,
    adjustedScore,
    highCardCount,
    trumpStrength: 0, // Computed separately if trump suit is known
    suitDistribution,
    estimatedPoints: calculateBidFromEstimate(adjustedScore),
  };
}

/**
 * Convert estimated points to a valid bid amount.
 * Rounds up to nearest 10, minimum MIN_BEAT.
 */
export function calculateBidFromEstimate(estimatedPoints: number): number {
  if (estimatedPoints < MIN_BEAT) {
    return MIN_BEAT;
  }
  const base = Math.ceil(estimatedPoints / 10) * 10;
  return Math.max(MIN_BEAT, Math.min(base, MAX_BID));
}

/**
 * Evaluate AI bidding decision — bid only when confidence exceeds current
 * bid by a 15% margin, otherwise pass.
 */
export function aiDecideBidOrPass(
  hand: Card[],
  currentHighestBid: Bid | null,
): { action: 'BID'; amount: number } | { action: 'PASS' } {
  const evaluation = evaluateHand(hand);
  const currentBid = currentHighestBid?.amount ?? MIN_BEAT;

  // Only bid if confidence is high enough above current bid (15% margin)
  const confidenceThreshold = currentBid * 1.15;

  if (evaluation.estimatedPoints >= confidenceThreshold) {
    return { action: 'BID', amount: evaluation.estimatedPoints };
  }

  return { action: 'PASS' };
}

/**
 * Heuristic: should an AI player bid Thanni on its first action? Thanni
 * requires winning all 4 tricks with no trump and a folded partner — a high-
 * risk, high-reward bid. The AI bids Thanni only when its 4-card hand is
 * strong in absolute terms (top-end cards across distinct suits) AND the
 * starting position is favorable (it's a real gamble, not a desperate move).
 *
 * The caller must additionally verify via `isGuaranteedSweep(hand)` that the
 * bid carries genuine risk (a guaranteed-sweep hand is disallowed by the rules).
 */
export function aiShouldBidThanni(hand: Card[]): boolean {
  if (hand.length !== 4) return false;

  // Count top cards: J (highest) and 9 (second-highest by point value) are the
  // most sweep-relevant cards, since they win tricks outright in a no-trump round.
  let jCount = 0;
  let nineCount = 0;
  let aCount = 0;
  const suits = new Set<Suit>();
  for (const c of hand) {
    suits.add(c.suit);
    if (c.value === 'J') jCount++;
    else if (c.value === '9') nineCount++;
    else if (c.value === 'A') aCount++;
  }

  // Strong Thanni candidate: at least 2 Jacks across distinct suits, ideally
  // backed by an A or 9. This is aggressive but matches the spirit of "I think
  // I can take every trick if I lead well" — and the sweep pre-check filters
  // out the true guaranteed-sweep cases (those are disallowed, not strategic).
  if (jCount >= 2 && suits.size >= 2 && (nineCount >= 1 || aCount >= 1)) return true;
  // Three Jacks in any distribution is a strong enough start to gamble.
  if (jCount >= 3) return true;

  return false;
}

// ============================================================================
// SECTION 2: GAMEPLAY AI — Trick-winning card selection
// ============================================================================

/** Minimal player shape required by the dealer-rotation AI. */
export interface AIPlayer {
  id: string;
  team: Team;
}

/**
 * Determine the currently winning PlayedCard in a partially/fully played trick.
 */
export function winningOfPile(
  pile: PlayedCard[],
  trumpOpen: boolean,
  trump: Suit | null,
): PlayedCard | null {
  if (!pile.length) return null;
  const trumps = trumpOpen && trump ? pile.filter(pc => pc.card.suit === trump) : [];
  let cands = trumps.length ? trumps : pile.filter(pc => pc.card.suit === pile[0].card.suit);
  if (!cands.length) cands = pile;
  return cands.slice().sort((a, b) => b.card.pointValue - a.card.pointValue)[0];
}

/**
 * AI card selection — always tries to win the trick while conserving high cards.
 *
 * Strategy:
 *  - Leading: play the highest card of the longest non-trump suit to drive
 *    the round; fall back to trump if that's all we have.
 *  - Following:
 *    • If our partner is currently winning the trick → dump the cheapest
 *      legal card (save high cards for tricks we must win).
 *    • If an opponent is winning → play the cheapest legal card that beats
 *      the current best. If we cannot beat them, dump the cheapest legal card.
 *
 * "Cheapest that beats" keeps J / 9 (the heavy point cards) back for later
 * tricks where they can secure points — this is what makes the AI bid-aware:
 * it tries to win every trick using as few points as possible, so it can
 * accumulate enough points to make its bid or deny the opponents theirs.
 */
export function aiPickCard(
  legal: Card[],
  pile: PlayedCard[],
  _meId: string,
  partnerId: string,
  trumpOpen: boolean,
  trump: Suit | null,
): Card {
  const byPtsDesc = (a: Card, b: Card) => b.pointValue - a.pointValue;
  const byPtsAsc = (a: Card, b: Card) => a.pointValue - b.pointValue;

  // Leading a new trick
  if (pile.length === 0) {
    const nonTrump = legal.filter(c => !trump || c.suit !== trump);
    const pool = nonTrump.length ? nonTrump : legal;
    // Highest non-trump to dominate; prefer cards from our longest suit
    return pool.slice().sort(byPtsDesc)[0];
  }

  const curBest = winningOfPile(pile, trumpOpen, trump);
  const partnerWinning = curBest && curBest.playerId === partnerId;

  // Partner is winning → conserve: discard the cheapest legal card
  if (partnerWinning) {
    return legal.slice().sort(byPtsAsc)[0];
  }

  // Opponent is winning → try to beat with the cheapest winning card
  // Cards that can beat the current best (same suit, higher value) or trumps
  const beaters = legal.filter(c => {
    if (!curBest) return false;
    const curIsTrump = trumpOpen && trump && curBest.card.suit === trump;
    const isTrump = trumpOpen && trump && c.suit === trump;
    // Trump beats non-trump
    if (isTrump && !curIsTrump) return true;
    // Higher trump beats lower trump
    if (isTrump && curIsTrump) return c.pointValue > curBest.card.pointValue;
    // Same led suit, higher value (and current best wasn't a trump)
    if (!curIsTrump && c.suit === curBest.card.suit && c.pointValue > curBest.card.pointValue) return true;
    return false;
  });

  if (beaters.length) return beaters.slice().sort(byPtsAsc)[0];

  // Cannot beat → dump cheapest legal card (save high cards)
  return legal.slice().sort(byPtsAsc)[0];
}

// ============================================================================
// SECTION 3: DEALER ROTATION AI — Trailing team keeps dealing
// ============================================================================

/**
 * Determine next dealer per the "trailing team keeps dealing" rule:
 * The dealer stays on the SAME player as long as that player's team is
 * trailing in overall match score. When tied, rotate clockwise. When the
 * dealer's team is NOT trailing, pass the deal to a player on the trailing team.
 *
 * Accepts any player object that satisfies the `AIPlayer` interface
 * (must have at least `id: string` and `team: Team`), so it works with both
 * the engine's `Player` type and the UI's `PlayerState` type.
 */
export function computeNextDealer<T extends AIPlayer>(
  prevDealerId: string,
  redPts: number,
  blackPts: number,
  players: T[],
): string {
  if (redPts === blackPts) return getNextPlayerClockwise(prevDealerId);
  const trailingTeam: Team = redPts < blackPts ? 'RED' : 'BLACK';
  const dealerPlayer = players.find(p => p.id === prevDealerId);
  if (dealerPlayer && dealerPlayer.team === trailingTeam) return prevDealerId; // keep same player
  // Pass to a player on the trailing team (clockwise from current dealer)
  for (let i = 1; i <= 3; i++) {
    const cand = getNextPlayerClockwise(prevDealerId, i);
    const cp = players.find(p => p.id === cand);
    if (cp && cp.team === trailingTeam) return cand;
  }
  return getNextPlayerClockwise(prevDealerId);
}