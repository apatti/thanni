/**
 * AIStrategy.ts — pluggable per-seat AI strategy interface.
 *
 * The interface covers cardplay (`chooseCard`) and bidding (`chooseBid`).
 * Thanni and Hath Band call-decisions remain as standalone heuristic helpers
 * (`aiShouldBidThanni`, `aiShouldCallHathBand`) — they short-circuit BEFORE
 * the strategy is consulted in the UI's bidding and Hath Band eligibility
 * effects, so strategies never see those decisions.
 *
 * Strategies are PURE: no side effects on the input view, no React state
 * mutations, no DOM access. The view is a read-only snapshot of the game
 * at decision time.
 */

import type { Card, PlayerId, PlayedCard, Suit, Bid } from '../../thanniEngine';

/** Read-only game-state view passed to the cardplay strategy. */
export interface CardplayView {
  /** The seat making this cardplay decision (e.g., 'p1'). */
  myId: PlayerId;
  /** The decision-maker's current hand (already reduced by prior plays this round). */
  myHand: Card[];
  /** Cards legal to play right now (respects led-suit follow rule + trump-reveal rules). */
  legal: Card[];
  /** Trick pile so far this trick — empty when leading. */
  trickPile: PlayedCard[];
  /** Trump suit for the round, or null if not set / hidden / solo round (no trump). */
  trump: Suit | null;
  /** Whether trump has been revealed and is now in effect. */
  trumpOpen: boolean;
  /** The decision-maker's partner seat id (folded partner in a solo round). */
  partnerId: PlayerId;
  /** True when this round is a Thanni or Hath Band solo round (no trump, partner folded). */
  isSoloRound: boolean;
  /** Caller of the solo bid (Thanni bidder or Hath Band caller) — null in a normal round. */
  soloCallerId: PlayerId | null;
  /** Folded partner seat id in a solo round — null in a normal round. */
  foldedPartnerId: PlayerId | null;
  /** Tricks remaining this round (including the current trick). */
  tricksRemaining: number;
  /**
   * FULL hands of all 4 players at decision time. Heuristic strategies ignore
   * this field. MCTS / GA strategies can use it as perfect-info determinization
   * (when running IS-MCTS, the caller determinizes the unseen portion of
   * opponents' hands before constructing the view).
   */
  fullHands: Map<PlayerId, Card[]>;
  /** Differential match balance (positive = RED leads, negative = BLACK leads). */
  balance: number;
  /** The seat that won the bid this round (null until bidding completes). */
  bidWinner: PlayerId | null;
  /** The current high bid (null before any numeric bid is placed). */
  currentBid: Bid | null;
}

/** Read-only game-state view passed to the bidding strategy. */
export interface BiddingView {
  /** The seat making this bidding decision. */
  myId: PlayerId;
  /** This player's 4 phase-1 cards. */
  myHand: Card[];
  /** Current high bid (null at the start of the round). */
  currentHighestBid: Bid | null;
  /** Smallest legal raise (= currentBid.amount + 10, or MIN_BEAT if no bid). */
  minNextBid: number;
  /** Passes registered since the last bid was placed. */
  passesSinceLastBid: number;
  /**
   * True iff this player has neither passed nor placed a numeric bid this round
   * — i.e., they could still bid Thanni instead of placing a numeric bid.
   * Heuristic strategies ignore this. MCTS / GA strategies can use it as part
   * of their action mask.
   */
  thanniEligible: boolean;
  /** Differential match balance (for "match almost over — push higher" later). */
  balance: number;
}

/** Decision returned by the bidding strategy. */
export type BidChoice =
  | { kind: 'PASS' }
  | { kind: 'BID'; amount: number };

/**
 * Pluggable AI strategy. Both methods are pure (no side effects on the view).
 * Implementations: `HeuristicAI` (reference — wraps existing `aiPickCard`),
 * with `MctsAI` and `GaAI` reserved for future work.
 */
export interface AIStrategy {
  /** Identifier for debugging / A/B logging. */
  readonly name: string;
  /** Choose a card to play given the current cardplay view. */
  chooseCard(view: CardplayView): Card;
  /** Choose to pass or place a numeric bid given the current bidding view. */
  chooseBid(view: BiddingView): BidChoice;
}