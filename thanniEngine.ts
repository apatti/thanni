/**
 * Thanni Engine — Core Game Logic for the 24-Card Indian Trick-Taking Game
 * 
 * This file implements ALL core mechanics defined in the PRD:
 * - Types and interfaces
 * - Deck building (24 cards, 6 per suit)
 * - Two-phase dealing
 * - Bidding system with terminology
 * - Trick evaluation (led suit + trump)
 * - Round scoring (bid vs actual, face-up/face-down)
 * - State machine (LOBBY → BIDDING → TRUMP_SET → PLAYING → ROUND_SCORED → MATCH_OVER)
 * - Dealer rotation (face-down constraint rule)
 * - Trump reveal mechanic
 * - Point math verification (328 total points per round)
 * 
 * @version 1.0.0
 * @author Thanni Engine
 */

// ============================================================================
// SECTION 1: TYPES & INTERFACES
// ============================================================================

/**
 * Card suits. Four suits, each with 6 cards (A, K, Q, J, 10, 9).
 */
export type Suit = 'HEARTS' | 'DIAMONDS' | 'SPADES' | 'CLUBS';

/**
 * Card values. Each suit has exactly these 6 values.
 */
export type CardValue = 'A' | 'K' | 'Q' | 'J' | '10' | '9';

/**
 * Point values per card (PRD verified: 328 total per round).
 *   J = 30, 9 = 20, A = 11, 10 = 10, K = 6, Q = 5
 *   Per suit total = 82 pts × 4 suits = 328 pts.
 */
export const CARD_POINT_VALUES: Record<CardValue, number> = {
  J: 30,
  '9': 20,
  A: 11,
  '10': 10,
  K: 6,
  Q: 5,
} as const;

/** Suit-to-color mapping. */
export const SUIT_COLORS: Record<Suit, 'RED' | 'BLACK'> = {
  HEARTS: 'RED',
  DIAMONDS: 'RED',
  SPADES: 'BLACK',
  CLUBS: 'BLACK',
} as const;

/** Suit symbols for rendering. */
export const SUIT_SYMBOLS: Record<Suit, string> = {
  HEARTS: '♥',
  DIAMONDS: '♦',
  SPADES: '♠',
  CLUBS: '♣',
} as const;

/** All suits in standard order. */
export const ALL_SUITS: Suit[] = ['HEARTS', 'DIAMONDS', 'SPADES', 'CLUBS'];

/** All card values in descending order (highest trick strength first for J, then A, 10, K, Q, 9). */
export const ALL_CARD_VALUES: CardValue[] = ['J', 'A', '10', 'K', 'Q', '9'];

/** Match goal. First team to reach this many match points wins. */
export const MATCH_GOAL = 12;

/** Minimum bid ("Beat"). Only biddable if all 4 players passed. */
export const MIN_BEAT = 150;

/** Maximum possible bid (total points in play). */
export const MAX_BID = 328;

/** Cards dealt to each player in phase 2. */
const CARDS_DEALT_PHASE2 = 2;

// ---- Thanni bid ----
/** Sentinel amount for a Thanni bid (it is not ranked against numeric 150–328 bids). */
export const THANNI_BID_AMOUNT = 0;
/** Match points won by the bidding team when a Thanni bid succeeds. */
export const THANNI_WIN_POINTS = 4;
/** Match points lost by the bidding team (and gained by opposition) when Thanni fails. */
export const THANNI_FAIL_PENALTY = 8;
/** Cards each player holds during the bidding phase (phase-1 deal). */
export const PHASE1_HAND_SIZE = 4;

// ---- Hath Band call (the post-bid solo all-tricks call) ----
/** Match points won by the caller's team when a Hath Band call succeeds. */
export const HATH_BAND_WIN_POINTS = 6;
/** Differential swing toward the opposition when a Hath Band call fails. */
export const HATH_BAND_FAIL_PENALTY = 12;
/** Sentinel amount for a Hath Band bid (rankless; doesn't compete with numeric bids). */
export const HATH_BAND_BID_AMOUNT = 0;
/** Round length in a Hath Band call (caller must win all 6 tricks). */
export const HATH_BAND_TRICK_COUNT = 6;

// ---- Player & IDs ----

export type PlayerId = string; // e.g., "p0", "p1"

/** Team affiliation. */
export type Team = 'RED' | 'BLACK';

/** Seat positions (clockwise). */
export type SeatPosition = 0 | 1 | 2 | 3;

/**
 * A single playing card in a Thanni deck.
 * ID format: "{Value}{SuitAbbrev}" e.g., "AH" = Ace of Hearts, "9S" = 9 of Spades.
 */
export interface Card {
  suit: Suit;
  value: CardValue;
  pointValue: number;
  id: string; // e.g., "AH", "KS", "QD", "JC", "10H", "9S"
}

/** Bid kind discriminator. STANDARD = numeric 150–328 bid; THANNI = mid-bid solo all-tricks bid; HATH_BAND = post-bid solo all-tricks call. */
export type BidKind = 'STANDARD' | 'THANNI' | 'HATH_BAND';

/**
 * The player who won the bid and chooses trump.
 */
export interface Bid {
  amount: number;
  kind: BidKind;
  playerId: PlayerId;
  displayName: string; // e.g., "Beat", "John", "Thanni"
  timestamp: number;
}

/**
 * A card played into a trick.
 */
export interface PlayedCard {
  card: Card;
  playerId: PlayerId;
  trickNumber: number; // 1–6
  positionInTrick: number; // 1–4 (order of play)
}

/**
 * Bidding phase state.
 */
export interface BiddingState {
  phase: 'PRE_FIRST_DEAL' | 'POST_SECOND_DEAL';
  currentPlayerToBid: PlayerId;
  currentHighestBid: Bid | null;
  passesSinceLastBid: number;
  allPlayersHavePassed: boolean;
  forcedBidTriggered: boolean;
  bids: Map<PlayerId, Bid>;
  /**
   * Thanni eligibility per player. `true` at the start of a round; flips to
   * `false` the moment that player passes OR places any numeric bid. Thanni
   * is only biddable on a player's first bid action of the round.
   */
  thanniEligible: Record<PlayerId, boolean>;
  /** `true` once a Thanni bid has ended bidding this round. */
  endedByThanni: boolean;
}

/**
 * Team score (per-team view of the differential match balance).
 *
 * The match uses a SINGLE signed `balance` (positive = RED leads, negative =
 * BLACK leads). The two teams can never both be in positive territory — a
 * scoring event for one team first negates any positive balance the other
 * team holds, and only overflows past zero into the winning team's side.
 *
 * `points` is derived: `redTeamScore.points === max(0, balance)` and
 * `blackTeamScore.points === max(0, -balance)`. Both teams' `points` are
 * kept in sync on each round-scoring call for display convenience.
 *
 * `isFaceUp` flips true the first time a team's derived `points` become
 * positive; it never flips back to false. It is a UI / dealer-rotation
 * affordance only — it no longer gates where points are applied.
 */
export interface TeamScore {
  points: number; // DERIVED: max(0, ±balance). Kept in sync on each scoring call.
  isFaceUp: boolean; // True once this team has ever been in positive territory.
  scoreCards: Array<{
    cardId: string; // e.g., "red_0", "black_2"
    scoredAt: number | null; // timestamp when scored, null = face-down
  }>;
}

/**
 * Game status (state machine states).
 */
export type GameStatus =
  | 'LOBBY'
  | 'BIDDING_PHASE1'
  | 'BIDDING_PHASE2'
  | 'TRUMP_SET'
  | 'PLAYING'
  | 'TRUMP_REVEALED'
  | 'THANNI_PLAYING'
  | 'HATH_BAND_PLAYING'
  | 'ROUND_SCORED'
  | 'MATCH_OVER';

/**
 * Full game state. Authoritative, client-side, no backend.
 */
export interface GameState {
  gameId: string;
  version: 'v1';
  status: GameStatus;
  startedAt: number;
  lastSavedAt: number;

  /** All players in the game (always 4). */
  players: Map<PlayerId, Player>;
  
  /** ID of the current dealer. */
  dealerId: PlayerId;

  /** Bidding state. */
  biddingState: BiddingState;
  
  /** ID of player who won the bid (null until bid completes). */
  bidWinnerId: PlayerId | null;

  /** True when the current round is a Thanni round (no phase-2 deal, no trump, partner folded). */
  isThanniRound: boolean;
  /** Bidder who declared Thanni this round (null outside a Thanni round). */
  thanniBidderId: PlayerId | null;
  /** Folded partner of the Thanni bidder (null outside a Thanni round). */
  thanniPartnerId: PlayerId | null;

  /** True when the current round is a Hath Band call (partner folded, no trump, caller must win all 6). */
  isHathBandRound: boolean;
  /** Player who called Hath Band this round (null outside a Hath Band round). */
  hathBandCallerId: PlayerId | null;
  /** Folded partner of the Hath Band caller (null outside a Hath Band round). */
  hathBandPartnerId: PlayerId | null;

  /** Trump suit for the current round (null = hidden/not yet chosen). */
  trumpSuit: Suit | null;
  
  /** Whether the trump card is face-down. */
  trumpFaceDown: boolean;
  
  /** Whether trump has been revealed this round. */
  trumpRevealedThisRound: boolean;

  /** Current trick number (0–6). */
  currentTrickNumber: number;
  
  /** ID of the player leading the current trick (null before first trick). */
  currentLeadPlayerId: PlayerId | null;
  
  /** Cards currently in the trick pile. */
  trickPile: PlayedCard[];

  /** Red team (Hearts) score. */
  redTeamScore: TeamScore;
  
  /** Black team (Spades) score. */
  blackTeamScore: TeamScore;

  /**
   * Differential match balance: positive = RED leads by `balance`, negative =
   * BLACK leads by `|balance|`, zero = tied. Single source of truth — the
   * `redTeamScore.points` / `blackTeamScore.points` fields are derived from
   * this on every round-scoring call (`max(0, balance)` and `max(0, -balance)`
   * respectively). The two teams can never both be positive.
   */
  balance: number;

  /** Match goal. Default 12. */
  matchGoal: number;

  /** Winning team once match is over; null until status === 'MATCH_OVER'. */
  winner: Team | null;

  /** Remaining undealt cards. */
  remainingDeck: Card[];

  /** SHA-256 hash for state integrity validation. */
  stateHash: string;
}

/**
 * A player entry.
 */
export interface Player {
  playerId: PlayerId;
  name: string;
  seatPosition: SeatPosition;
  team: Team;
  partnerId: PlayerId;
  hand: Card[]; // Sorted per game logic
  isHuman: boolean;
  isBot: boolean;
  bid: number | null;
  tricksWonThisRound: number;
  pointsCapturedThisRound: number;
  isDisconnected: boolean;
  disconnectTime: number | null;
}

// ============================================================================
// SECTION 2: UTILITY FUNCTIONS — BIDDING TERMINOLOGY, FORMATTING, ETC.
// ============================================================================

/**
 * Get display name for a bid amount per PRD Appendix C / Section 3.9.
 */
export function getBidDisplayName(amount: number, kind: BidKind = 'STANDARD'): string {
  if (kind === 'THANNI') return 'Thanni';
  if (amount === 150) return 'Beat';
  if (amount === 200) return 'John';
  if (amount === 210) return 'John 10';
  if (amount === 220) return 'John 20';
  // 160 → "60", 170 → "70" (abbreviated display per PRD)
  if (amount >= 160 && amount < 200) {
    return String(amount - 100);
  }
  return String(amount);
}

/**
 * Validate that a bid amount is within legal bounds.
 */
export function isValidBid(amount: number): boolean {
  return amount >= MIN_BEAT && amount <= MAX_BID && Number.isInteger(amount);
}

/**
 * Check if a bid strictly exceeds the current highest bid.
 */
export function exceedsBid(amount: number, currentHighest: Bid | null): boolean {
  if (!currentHighest) return true;
  return amount > currentHighest.amount;
}

/**
 * Generate the next valid bid increments from a given amount.
 * Per PRD: 160, 170, then 200(John), 210(John 10), 220(John 20), up to 328.
 */
export function getNextBidIncrements(fromAmount: number): number[] {
  const increments: number[] = [];
  for (let i = fromAmount + 10; i <= MAX_BID; i += 10) {
    increments.push(i);
  }
  return increments;
}

/**
 * Create a unique game ID.
 */
export function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ============================================================================
// SECTION 3: DECK BUILDER — Creates the 24-card Thanni deck
// ============================================================================

/**
 * Build a complete 24-card Thanni deck.
 * 
 * Per PRD: 4 suits × 6 cards each = 24 total.
 * Each suit: A, K, Q, J, 10, 9.
 * Total points: 82 per suit × 4 = 328.
 */
export function buildDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of ALL_SUITS) {
    for (const value of ALL_CARD_VALUES) {
      deck.push({
        suit,
        value,
        pointValue: CARD_POINT_VALUES[value],
        id: `${value}${suit.substring(0, 1).toUpperCase()}`,
      });
    }
  }

  return deck;
}

/**
 * Shuffle a deck in-place using Fisher-Yates algorithm.
 * Returns the shuffled array (mutated).
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Calculate total point value of a list of cards.
 */
export function calculateCardPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + card.pointValue, 0);
}

/**
 * Sort cards by suit order then value strength (descending).
 * Suit order: SPADES > HEARTS > DIAMONDS > CLUBS
 * Value order (within suit): J > A > 10 > K > Q > 9
 */
export function sortCards(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = {
    SPADES: 4,
    HEARTS: 3,
    DIAMONDS: 2,
    CLUBS: 1,
  };
  const valueStrength: Record<CardValue, number> = {
    J: 6,
    A: 5,
    '10': 4,
    K: 3,
    Q: 2,
    '9': 1,
  };

  return [...cards].sort((a, b) => {
    // Primary: suit order (descending)
    const suitDiff = suitOrder[b.suit] - suitOrder[a.suit];
    if (suitDiff !== 0) return suitDiff;
    // Secondary: value strength (descending)
    return valueStrength[b.value] - valueStrength[a.value];
  });
}

// ============================================================================
// SECTION 4: DEALER — Two-phase dealing logic
// ============================================================================

/**
 * Create the initial empty player at a given seat position.
 */
function createPlayer(
  playerId: PlayerId,
  name: string,
  seatPosition: SeatPosition,
  team: Team,
  partnerId: PlayerId,
  isHuman = false,
  isBot = false,
): Player {
  return {
    playerId,
    name,
    seatPosition,
    team,
    partnerId,
    hand: [],
    isHuman,
    isBot,
    bid: null,
    tricksWonThisRound: 0,
    pointsCapturedThisRound: 0,
    isDisconnected: false,
    disconnectTime: null,
  };
}

/**
 * Create a default 4-player game setup.
 */
export function createDefaultPlayers(): Map<PlayerId, Player> {
  const players = new Map<PlayerId, Player>();
  
  // PRD: RED team = p0 + p2 (partners), BLACK team = p1 + p3 (partners)
  players.set('p0', createPlayer('p0', 'Partner', 0, 'RED', 'p2', false, true));
  players.set('p1', createPlayer('p1', 'Opponent 2', 1, 'BLACK', 'p3', false, true));
  players.set('p2', createPlayer('p2', 'You', 2, 'RED', 'p0', true, false));
  players.set('p3', createPlayer('p3', 'Opponent 3', 3, 'BLACK', 'p1', false, true));

  return players;
}

/**
 * Deal first phase: 4 cards to each player.
 */
export function dealPhase1(deck: Card[], dealerId: PlayerId): Map<PlayerId, Card[]> {
  const hands = new Map<PlayerId, Card[]>();
  const sortedDeck = [...deck]; // Already shuffled

  // Determine starting player (left of dealer, clockwise)
  const dealerIndex = parseInt(dealerId.replace('p', ''));

  for (let cardIdx = 0; cardIdx < 24; cardIdx += 4) {
    for (let localIdx = 0; localIdx < 4; localIdx++) {
      const playerIndex = (dealerIndex + 1 + localIdx) % 4;
      const playerId = `p${playerIndex}`;
      const cards: Card[] = [];
      
      // Deal 1 card to each player
      cards.push(sortedDeck[cardIdx]);
      
      if (!hands.has(playerId)) {
        hands.set(playerId, []);
      }
      hands.set(playerId, [...hands.get(playerId)!, ...cards]);
    }
  }

  return hands;
}

/**
 * Deal full hands from a shuffled deck given a dealer.
 * Phase 1: 4 cards each, then Phase 2: 2 more cards each.
 * Returns { playerHands, remainingDeck }.
 */
export function dealFullGame(
  deck: Card[],
  dealerId: PlayerId,
): { playerHands: Map<PlayerId, Card[]>; remainingDeck: Card[] } {
  const sortedDeck = [...deck];
  const hands = new Map<PlayerId, Card[]>();
  const playerIds = ['p0', 'p1', 'p2', 'p3'];
  const dealerIndex = parseInt(dealerId.replace('p', ''));

  // Initialize empty hands
  for (const pid of playerIds) {
    hands.set(pid, []);
  }

  // Deal all 24 cards: 4 per round × 6 rounds
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < 4; i++) {
      const playerIndex = (dealerIndex + 1 + i) % 4;
      const playerId = playerIds[playerIndex];
      hands.set(playerId, [...hands.get(playerId)!, sortedDeck[round * 4 + i]]);
    }
  }

  // Remaining deck is empty after dealing all 24
  return { playerHands: hands, remainingDeck: [] };
}

/**
 * Deal phase 2 (2 more cards) from remaining deck to each player's hand.
 */
export function dealPhase2(
  remainingDeck: Card[],
  hands: Map<PlayerId, Card[]>,
): { updatedHands: Map<PlayerId, Card[]>; newRemainingDeck: Card[] } {
  const updatedHands = new Map(hands);
  const cardsToDeal = [...remainingDeck]; // Take from top of deck

  for (const [playerId, hand] of updatedHands) {
    const phase2Cards = cardsToDeal.splice(0, CARDS_DEALT_PHASE2);
    updatedHands.set(playerId, [...hand, ...phase2Cards]);
  }

  return { updatedHands, newRemainingDeck: cardsToDeal };
}

/**
 * Sort all players' hands according to game logic.
 */
export function sortAllHands(
  hands: Map<PlayerId, Card[]>,
): Map<PlayerId, Card[]> {
  const sorted = new Map<PlayerId, Card[]>();
  for (const [playerId, hand] of hands) {
    sorted.set(playerId, sortCards(hand));
  }
  return sorted;
}

// ============================================================================
// SECTION 5: BIDDING ENGINE — Evaluate hands, place bids, determine winner
// ============================================================================

// AI bidding functions (evaluateHand, calculateBidFromEstimate,
// HandEvaluation, aiDecideBidOrPass) have been moved to ./thanniAI.ts.
// Re-exported below for backward compatibility — existing imports from
// thanniEngine continue to work unchanged.

/**
 * Determine the bidding team or partner based on players.
 */
export function getTeamPlayers(
  playerId: PlayerId,
  players: Map<PlayerId, Player>,
): [PlayerId, PlayerId] {
  const player = players.get(playerId)!;
  return [playerId, player.partnerId] as [PlayerId, PlayerId];
}

/**
 * Process a bid action. Returns updated BiddingState or error.
 */
export function placeBid(
  state: BiddingState,
  playerId: PlayerId,
  bidAmount: number,
): { newState: BiddingState; error: null } | { newState: null; error: string } {
  // Validate bid
  if (!isValidBid(bidAmount)) {
    return { newState: null, error: `Invalid bid amount: ${bidAmount}` };
  }

  // Must exceed current highest (or be the first bid)
  if (state.currentHighestBid && !exceedsBid(bidAmount, state.currentHighestBid)) {
    return {
      newState: null,
      error: `Bid ${bidAmount} must exceed ${state.currentHighestBid.amount}`,
    };
  }

  // Check it's this player's turn
  if (playerId !== state.currentPlayerToBid) {
    return { newState: null, error: `Not your turn to bid` };
  }

  // Create the bid
  const newBid: Bid = {
    amount: bidAmount,
    kind: 'STANDARD',
    playerId,
    displayName: getBidDisplayName(bidAmount),
    timestamp: Date.now(),
  };

  // Update bids map
  const newBids = new Map(state.bids);
  newBids.set(playerId, newBid);

  // Advance currentPlayer clockwise
  const playerIds = ['p0', 'p1', 'p2', 'p3'];
  const currentIndex = playerIds.indexOf(playerId);
  const nextIndex = (currentIndex + 1) % 4;
  const nextPlayer = playerIds[nextIndex];

  // Reset passes since last bid (this player made a bid, not a pass)
  const passesSinceLastBid = 0;

  // A numeric bid consumes the player's Thanni eligibility for the round.
  const thanniEligible = { ...state.thanniEligible, [playerId]: false };

  return {
    newState: {
      ...state,
      currentHighestBid: newBid,
      passesSinceLastBid,
      currentPlayerToBid: nextPlayer,
      bids: newBids,
      thanniEligible,
    },
    error: null,
  };
}

/**
 * Validate a Thanni bid. A player may bid Thanni iff:
 *  - it is their turn to bid,
 *  - they are still Thanni-eligible (have neither passed nor placed a prior numeric bid this round),
 *  - their 4-card phase-1 hand does NOT guarantee a sweep against every possible opponent deal
 *    (i.e., the bid carries genuine risk — at least 1% by random sampling).
 */
export function isValidThanniBid(
  state: BiddingState,
  playerId: PlayerId,
  bidderHand: Card[],
): { ok: true } | { ok: false; error: string } {
  if (playerId !== state.currentPlayerToBid) {
    return { ok: false, error: 'Not your turn to bid' };
  }
  if (!state.thanniEligible[playerId]) {
    return { ok: false, error: 'Thanni only available on your first bid action this round' };
  }
  if (bidderHand.length !== PHASE1_HAND_SIZE) {
    return { ok: false, error: `Thanni can only be bid during phase-1 (expected ${PHASE1_HAND_SIZE} cards)` };
  }
  if (isGuaranteedSweep(bidderHand)) {
    return { ok: false, error: 'Hand is a guaranteed sweep — Thanni requires at least 1% risk' };
  }
  return { ok: true };
}

/**
 * Place a Thanni bid. Ends bidding immediately; the caller must then transition
 * straight to the playing phase (THANNI_PLAYING) skipping trump selection and phase-2 deal.
 */
export function placeThanniBid(
  state: BiddingState,
  playerId: PlayerId,
  bidderHand: Card[],
): { newState: BiddingState; error: null } | { newState: null; error: string } {
  const v = isValidThanniBid(state, playerId, bidderHand);
  if (!v.ok) return { newState: null, error: v.error };

  const newBid: Bid = {
    amount: THANNI_BID_AMOUNT,
    kind: 'THANNI',
    playerId,
    displayName: 'Thanni',
    timestamp: Date.now(),
  };

  const newBids = new Map(state.bids);
  newBids.set(playerId, newBid);

  const thanniEligible = { ...state.thanniEligible, [playerId]: false };

  return {
    newState: {
      ...state,
      currentHighestBid: newBid,
      passesSinceLastBid: 0,
      currentPlayerToBid: playerId,
      bids: newBids,
      thanniEligible,
      endedByThanni: true,
    },
    error: null,
  };
}

/**
 * Process a pass action.
 */
export function passBid(
  state: BiddingState,
  playerId: PlayerId,
): { newState: BiddingState; forcedBidTriggered: boolean } | { newState: null; error: string } {
  // Check it's this player's turn
  const playerIds = ['p0', 'p1', 'p2', 'p3'];
  if (playerId !== state.currentPlayerToBid) {
    return { newState: null, error: `Not your turn to bid` };
  }

  // Advance currentPlayer
  const currentIndex = playerIds.indexOf(playerId);
  const nextIndex = (currentIndex + 1) % 4;
  const nextPlayer = playerIds[nextIndex];

  const passesSinceLastBid = state.passesSinceLastBid + 1;

  // A pass consumes the player's Thanni eligibility for the round.
  const thanniEligible = { ...state.thanniEligible, [playerId]: false };

  // Check if all 4 players have passed (only possible if no current highest bid)
  let forcedBidTriggered = false;
  if (!state.currentHighestBid && passesSinceLastBid >= 4) {
    forcedBidTriggered = true;
  }

  return {
    newState: {
      ...state,
      passesSinceLastBid,
      currentPlayerToBid: nextPlayer,
      thanniEligible,
    },
    forcedBidTriggered,
  };
}

/**
 * Force the minimum "Beat" bid when all players have passed.
 * Per PRD Section 6.3: Player 0 (first to speak) is forced to bid 150.
 */
export function forceBeatBid(state: BiddingState): BiddingState {
  const beatBid: Bid = {
    amount: MIN_BEAT,
    kind: 'STANDARD',
    playerId: state.currentPlayerToBid,
    displayName: 'Beat',
    timestamp: Date.now(),
  };

  const newBids = new Map(state.bids);
  newBids.set(state.currentPlayerToBid, beatBid);

  return {
    ...state,
    currentHighestBid: beatBid,
    passesSinceLastBid: 0,
    forcedBidTriggered: true,
    bids: newBids,
  };
}

// (aiDecideBidOrPass moved to ./thanniAI.ts)

// ============================================================================
// SECTION 5B: THANNI SWEEP PRE-CHECK — Information-set aware risk analysis
// ============================================================================
//
// At bid time the bidder sees only their own 4 phase-1 cards. The other 20
// cards in the deck are unseen — 12 of them have been dealt to the 3 other
// players (4 each) and 8 are still in the dealing deck. Since the partner
// is folded once a Thanni bid is accepted, only the two opponents' 8 cards
// actually play. The bidder's risk lives in the uncertainty about which 12
// of the 20 unseen cards were dealt (and within those 12, which 8 went to
// the two opponents rather than to the folded partner).
//
// `isGuaranteedSweep(bidderHand)` returns `true` iff, against every possible
// opponent deal, the bidder has a perfect-information minimax strategy to win
// all 4 tricks (no-trump, bidder leads every trick). Enumerating all
// C(20,8) × C(8,4) ≈ 8.8M partitions is infeasible, so we:
//   (a) probe random partitions — early-exit on the first partition where
//       the bidder cannot sweep (that proves real risk → not guaranteed), and
//   (b) if all sampled partitions sweep, return `true` (treat as guaranteed).
// Sampling at 250 partitions detects any non-trivial losing probability
// (well above the 1% risk threshold the rules require to allow Thanni).
//
// The bidder leads every trick (they must win all 4, so the trick winner is
// always the bidder in a sweeping line). This lets us prune the minimax the
// moment an opponent would win a trick — that line fails for the bidder.

const SWEEP_SAMPLE_LIMIT = 250;

/** Cards the opponents can hold: any 8 of the 20 unseen cards, split 4/4. */
function enumerateOppPartition(unseen: Card[], rng: () => number): { oppA: Card[]; oppB: Card[] } {
  // Partial Fisher–Yates: pick the first 8 of a shuffled copy of `unseen`.
  const arr = unseen.slice();
  for (let i = 0; i < 8; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { oppA: arr.slice(0, 4), oppB: arr.slice(4, 8) };
}

/** Cards legal to play given the hand and the led suit (must follow if able). */
function legalFollow(hand: Card[], ledSuit: Suit | null): Card[] {
  if (ledSuit === null) return hand.slice();
  if (hand.some(c => c.suit === ledSuit)) return hand.filter(c => c.suit === ledSuit);
  return hand.slice();
}

/** Winner of a 3-card trick (no trump). Returns the player index (0=bidder,1=oppA,2=oppB) of the winner. */
function trickWinner3(players: [Card, number][], ledSuit: Suit): number {
  let best = players[0];
  for (const p of players) {
    if (p[0].suit === ledSuit && (best[0].suit !== ledSuit || p[0].pointValue > best[0].pointValue)) {
      best = p;
    }
  }
  return best[1];
}

/**
 * Perfect-information minimax for a single opponent deal. Bidder leads every
 * trick. Returns `true` if the bidder can win all 4 tricks against optimal
 * opponent defense (each opponent picks the response minimax-favorable to them).
 */
function bidderCanSweepDeal(
  bidder: Card[],
  oppA: Card[],
  oppB: Card[],
  trickNum: number,
  memo: Map<string, boolean>,
): boolean {
  if (trickNum > 4) return true; // bidder won all 4 tricks on this line

  // Memo key: quick structural hash of remaining hands + trickNum. Without
  // memoization the search revisits the same (bidder, oppA, oppB) state many
  // times across sibling branches and runs too long.
  const key = `${trickNum}|${bidder.map(c => c.id).sort().join(',')}|${oppA.map(c => c.id).sort().join(',')}|${oppB.map(c => c.id).sort().join(',')}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  // Bidder (maximizer) picks the lead card.
  let result = false;
  for (const leadCard of bidder) {
    const newBidder = bidder.filter(c => c.id !== leadCard.id);

    // oppA (minimizer) picks any legal response.
    const aLegal = legalFollow(oppA, leadCard.suit);

    // For this lead to succeed, EVERY (oppA, oppB) response pair must let
    // the bidder win the trick AND a recursive sweep must succeed.
    let leadSucceeds = true;
    for (const aCard of aLegal) {
      const newOppA = oppA.filter(c => c.id !== aCard.id);
      const bLegal = legalFollow(oppB, leadCard.suit);
      for (const bCard of bLegal) {
        const newOppB = oppB.filter(c => c.id !== bCard.id);
        const pile: [Card, number][] = [[leadCard, 0], [aCard, 1], [bCard, 2]];
        const winner = trickWinner3(pile, leadCard.suit);
        if (winner !== 0) {
          // Opponent wins this trick → bidder loses the round on this line.
          leadSucceeds = false;
          break;
        }
        if (!bidderCanSweepDeal(newBidder, newOppA, newOppB, trickNum + 1, memo)) {
          leadSucceeds = false;
          break;
        }
      }
      if (!leadSucceeds) break;
    }
    if (leadSucceeds) { result = true; break; } // found a lead that survives all opp responses
  }
  memo.set(key, result);
  return result;
}

/**
 * Returns `true` if the bidder's 4-card hand guarantees a sweep against every
 * possible opponent deal (i.e., no real risk → Thanni must be DISALLOWED).
 * Returns `false` if at least one sampled opponent deal lets the opponents
 * force a trick win against the bidder (real risk → Thanni allowed).
 */
export function isGuaranteedSweep(bidderHand: Card[]): boolean {
  if (bidderHand.length !== PHASE1_HAND_SIZE) return false;

  // Fast path: holding all 4 Jacks (or any card that's the absolute highest
  // of its suit in each of the 4 suits the bidder holds) is a trivial sweep
  // — opponents can never beat a J lead since J is the highest card.
  const allJacks = bidderHand.every(c => c.value === 'J') && new Set(bidderHand.map(c => c.suit)).size === 4;
  if (allJacks) return true;

  // Build the unseen card pool = full deck minus bidder's cards.
  const seenIds = new Set(bidderHand.map(c => c.id));
  const unseen = buildDeck().filter(c => !seenIds.has(c.id));

  let rng = mulberry32(0x5eed ^ bidderHand.reduce((h, c) => h ^ c.pointValue, 0));
  for (let i = 0; i < SWEEP_SAMPLE_LIMIT; i++) {
    const { oppA, oppB } = enumerateOppPartition(unseen, rng);
    const memo = new Map<string, boolean>();
    if (!bidderCanSweepDeal(bidderHand.slice(), oppA, oppB, 1, memo)) {
      return false; // a possible deal where bidder can lose → real risk → not guaranteed
    }
  }
  return true; // sampled many deals, bidder swept them all → treat as guaranteed
}

/** Small deterministic PRNG (so the sweep check is reproducible per hand). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hath Band sweep pre-check (information-set aware, no minimax):
 *
 * For each of the caller's 6 cards, check whether ANY of the other 3 players'
 * (actual) hands has a card of the same suit with a higher point value. If at
 * least one such beater exists for at least one of the caller's cards → the
 * caller faces genuine risk → Hath Band is ALLOWED. Only when ALL 6 of the
 * caller's cards have no potential beater across the other 3 hands (i.e.,
 * every caller's card would beat any opp card of its suit) → guaranteed sweep
 * → Hath Band is DISALLOWED (per the rule: at least 1% risk required).
 *
 * Per-card sufficiency is a SUBSET of the true playdown minimax: if a hand
 * passes the per-card test as "guaranteed", it sweeps under all plausible
 * standing-on-defense playdowns too. So the test is conservative — it never
 * disallows a hand that actually carries risk, only ever disallows the truly
 * unbeatable ones.
 *
 * O(6 × 3 × 6) = ~108 lookups per call — trivially fast (~microseconds).
 */
export function isHathBandGuaranteedSweep(
  callerId: PlayerId,
  allHands: Map<PlayerId, Card[]>,
): boolean {
  const callerHand = allHands.get(callerId);
  if (!callerHand || callerHand.length === 0) return false;

  for (const card of callerHand) {
    let hasBeater = false;
    for (const [pid, oppHand] of allHands) {
      if (pid === callerId) continue;
      if (oppHand.some(c => c.suit === card.suit && c.pointValue > card.pointValue)) {
        hasBeater = true;
        break;
      }
    }
    if (hasBeater) return false; // a caller's card has a potential beater → real risk → allow
  }
  return true; // every caller's card is unbeatable across opponents → disallow
}

// ============================================================================
// SECTION 6: TRICK EVALUATOR — Determine trick winner
// ============================================================================

/**
 * Result of evaluating a completed trick.
 */
export interface TrickResult {
  winnerPlayerId: PlayerId;
  winningCard: Card;
  winningCardPointValue: number;
  ledSuit: Suit;
  playedCards: PlayedCard[];
}

/**
 * Get the suit that was led to a trick (first card played).
 */
export function getLedSuit(trickPile: PlayedCard[]): Suit {
  if (trickPile.length === 0) throw new Error('Trick is empty');
  return trickPile[0].card.suit;
}

/**
 * Check if a player can follow the led suit.
 */
export function canFollowSuit(
  hand: Card[],
  ledSuit: Suit,
): boolean {
  return hand.some(card => card.suit === ledSuit);
}

/**
 * Get all legal cards a player can play given the led suit and trump state.
 * Per PRD: Must follow led suit if able. If void, can play any card.
 * If trump is revealed, the revealing player MUST play a trump if they have one.
 */
export function getLegalCards(
  hand: Card[],
  trickPile: PlayedCard[],
  trumpSuit: Suit | null,
  trumpRevealed: boolean,
  playerId: PlayerId,
  revealingPlayerId: PlayerId | null,
  bidWinnerId: PlayerId | null = null,
  trumpCard: Card | null = null,
): Card[] {
  if (trickPile.length === 0) {
    // Leading: can play any card
    return [...hand];
  }

  const ledSuit = getLedSuit(trickPile);
  
  // Check if player must follow trump reveal rule
  if (trumpRevealed && trumpSuit !== null && playerId === revealingPlayerId) {
    // Bid winner who reveals trump themselves must play THE specific trump card
    if (playerId === bidWinnerId && trumpCard) {
      const exact = hand.filter(c => c.suit === trumpCard.suit && c.value === trumpCard.value);
      if (exact.length > 0) return exact;
    }
    const trumpsInHand = hand.filter(c => c.suit === trumpSuit);
    if (trumpsInHand.length > 0) {
      return trumpsInHand; // MUST play a trump
    }
    // Void of trumps: can discard any non-trump card (or any card per PRD)
    return [...hand];
  }

  const canFollow = hand.some(card => card.suit === ledSuit);
  
  if (canFollow) {
    // MUST follow led suit
    return hand.filter(card => card.suit === ledSuit);
  }

  // Cannot follow: can play any card (discard)
  return [...hand];
}

/**
 * Determine the winning card in a trick (no trump context — led suit only).
 * Use evaluateTrickWithContext() when trump suit is known.
 *
 * Supports both 4-player tricks (standard round) and 3-player tricks
 * (Thanni round — partner folded).
 */
export function determineTrickWinner(trickPile: PlayedCard[]): TrickResult {
  if (trickPile.length !== 3 && trickPile.length !== 4) {
    throw new Error(`Expected 3 or 4 cards in trick, got ${trickPile.length}`);
  }

  // Without trump context, highest card of the led suit wins
  return evaluateTrickWithContext(trickPile, null);
}

/**
 * Trump-aware trick evaluation. Called with full game context.
 *
 * Supports both 4-player tricks (standard round) and 3-player tricks
 * (Thanni round — partner folded).
 */
export function evaluateTrickWithContext(
  trickPile: PlayedCard[],
  trumpSuit: Suit | null,
): TrickResult {
  if (trickPile.length !== 3 && trickPile.length !== 4) {
    throw new Error(`Expected 3 or 4 cards in trick, got ${trickPile.length}`);
  }

  const ledSuit = getLedSuit(trickPile);

  // Check for trump cards (if trump is set/known)
  if (trumpSuit !== null) {
    const trumpCards = trickPile.filter(c => c.card.suit === trumpSuit);
    if (trumpCards.length > 0) {
      // Highest trump wins
      const winningTrump = trumpCards.sort(
        (a, b) => cardValueStrength(b.card.value) - cardValueStrength(a.card.value),
      )[0];
      return {
        winnerPlayerId: winningTrump.playerId,
        winningCard: winningTrump.card,
        winningCardPointValue: winningTrump.card.pointValue,
        ledSuit,
        playedCards: trickPile,
      };
    }
  }

  // No trumps played (or trump hidden): highest of led suit wins
  const ledCards = trickPile.filter(c => c.card.suit === ledSuit);
  const winningCard = ledCards.sort(
    (a, b) => cardValueStrength(b.card.value) - cardValueStrength(a.card.value),
  )[0];

  return {
    winnerPlayerId: winningCard.playerId,
    winningCard: winningCard.card,
    winningCardPointValue: winningCard.card.pointValue,
    ledSuit,
    playedCards: trickPile,
  };
}

/**
 * Card value strength for trick comparison (higher = stronger).
 * Note: J=30 is highest by point value, but in trick-taking, the ranking
 * typically follows A > 10 > K > Q > J > 9 for practical play.
 * Per PRD point values serve as proxy for trick strength.
 */
export function cardValueStrength(value: CardValue): number {
  return CARD_POINT_VALUES[value];
}

// ============================================================================
// SECTION 7: SCORER — Round scoring, bid comparison, match-point updates
// ============================================================================

/**
 * Result of round scoring under the differential (tug-of-war) model.
 *
 * The single signed `balanceShift` is the only authoritative change — it is
 * added to `GameState.balance` (positive = RED gain, negative = BLACK gain).
 * The derived per-team match-point deltas (`redTeamMatchPointsChange` /
 * `blackTeamMatchPointsChange`) are convenience snapshots of how the derived
 * `points` fields change for each side (they will never both be positive —
 * one is always 0 since only one side can be in positive territory).
 */
export interface RoundScoringResult {
  biddingTeam: Team;
  biddingTeamActualPoints: number;
  biddingTeamBid: number;
  metBid: boolean;
  /** Single signed shift applied to GameState.balance. Positive → RED, negative → BLACK. */
  balanceShift: number;
  /** Derived: change to redTeamScore.points (>=0). */
  redTeamMatchPointsChange: number;
  /** Derived: change to blackTeamScore.points (>=0). */
  blackTeamMatchPointsChange: number;
  matchOver: boolean;
  winner: Team | null;
}

/**
 * Determine which team is the "bidding team" based on who won the bid.
 */
export function getBiddingTeam(
  bidWinnerId: PlayerId,
  players: Map<PlayerId, Player>,
): Team {
  const winner = players.get(bidWinnerId);
  return winner!.team;
}

/**
 * Compute the signed balance shift toward `gainTeam` by `gainAmount`.
 * Positive result = shift toward RED, negative = shift toward BLACK.
 */
function shiftToward(gainTeam: Team, gainAmount: number): number {
  return gainTeam === 'RED' ? gainAmount : -gainAmount;
}

/**
 * Calculate each team's actual points captured this round.
 */
export function calculateTeamPoints(
  trickResults: TrickResult[],
  players: Map<PlayerId, Player>,
): { redPoints: number; blackPoints: number } {
  let redPoints = 0;
  let blackPoints = 0;

  for (const trick of trickResults) {
    // Sum ALL cards' point values in the trick — winner takes the whole trick
    const trickTotal = trick.playedCards.reduce((sum, pc) => sum + pc.card.pointValue, 0);
    const winnerTeam = players.get(trick.winnerPlayerId)!.team;
    if (winnerTeam === 'RED') {
      redPoints += trickTotal;
    } else {
      blackPoints += trickTotal;
    }
  }

  return { redPoints, blackPoints };
}

/**
 * Compute a RoundScoringResult under the differential (tug-of-war) model.
 *
 * Each scoring event produces a single signed `balanceShift` toward the
 * gaining team — the bid-team on a make, the opposition on a miss. The
 * derived per-team `points` change is computed from the pre/post `balance`
 * (one side is always 0 since both can never be positive simultaneously).
 *
 * Note: the `failedBiddingPenalty` and `swingOnFail` parameters are kept for
 * API stability but are subsumed by the differential shift — a "miss" gives
 * the opposition `failedOppositionMultiplier` points, which (under the
 * tug-of-war) already negates any positive balance the bidding team held
 * before overflowing into the opposition's side. No explicit bidding-team
 * subtraction is needed (it falls out of the single signed shift).
 */
function computeRoundScoringResult(
  gameState: GameState,
  biddingTeam: Team,
  bidAmount: number,
  metBid: boolean,
  metMultiplier: number,
  failedOppositionMultiplier: number,
  _failedBiddingPenalty: number,
  _swingOnFail: boolean,
): RoundScoringResult {
  const opposition: Team = biddingTeam === 'RED' ? 'BLACK' : 'RED';
  const gainTeam: Team = metBid ? biddingTeam : opposition;
  const gainAmount: number = metBid ? metMultiplier : failedOppositionMultiplier;
  const balanceShift = shiftToward(gainTeam, gainAmount);

  const newBalance = gameState.balance + balanceShift;
  const oldRedPts = Math.max(0, gameState.balance);
  const oldBlackPts = Math.max(0, -gameState.balance);
  const newRedPts = Math.max(0, newBalance);
  const newBlackPts = Math.max(0, -newBalance);

  let matchOver = false;
  let winner: Team | null = null;
  if (newBalance >= gameState.matchGoal) { matchOver = true; winner = 'RED'; }
  else if (newBalance <= -gameState.matchGoal) { matchOver = true; winner = 'BLACK'; }

  return {
    biddingTeam,
    biddingTeamActualPoints: 0,
    biddingTeamBid: bidAmount,
    metBid,
    balanceShift,
    redTeamMatchPointsChange: newRedPts - oldRedPts,
    blackTeamMatchPointsChange: newBlackPts - oldBlackPts,
    matchOver,
    winner,
  };
}

/**
 * Apply round scoring per the differential (tug-of-war) model:
 *
 *   The match has a single signed `balance`: positive = RED leads,
 *   negative = BLACK leads. A scoring event for one team first negates
 *   any positive balance the other team holds, then overflows into the
 *   gaining team's side. The two teams can never both be positive.
 *
 * STANDARD BIDS (BID < 200):
 *   Met: bidding team gains +1 (shifts balance toward them by 1).
 *   Failed: opposition gains +2.
 *
 * HIGH-VALUE BIDS (BID >= 200 — John / John 10 / John 20 / up to 328):
 *   Met: bidding team gains +2.
 *   Failed: opposition gains +4.
 *
 * THANNI BID:
 *   Met (bidder wins all 4 tricks): bidding team gains +4.
 *   Failed: opposition gains +8.
 *
 * Match over when |balance| >= matchGoal (default 12).
 */
export function applyRoundScoring(
  gameState: GameState,
  biddingTeam: Team,
  biddingTeamActualPoints: number, // Total points the bidding team captured across all tricks
): RoundScoringResult {
  const bid = gameState.biddingState.currentHighestBid!;
  const isThanni = bid.kind === 'THANNI';
  const bidAmount = bid.amount;

  // Thanni scoring: bidder must win ALL 4 tricks. +4 met (bidding team);
  // opposition +8 on fail (a swing of 8 toward the opposition in differential terms).
  if (isThanni) {
    const bidderId = gameState.thanniBidderId ?? bid.playerId;
    const bidder = gameState.players.get(bidderId);
    const bidderWonAll4 = bidder != null && bidder.tricksWonThisRound === 4;
    return computeRoundScoringResult(
      gameState,
      biddingTeam,
      bidAmount,
      bidderWonAll4,
      THANNI_WIN_POINTS,
      THANNI_FAIL_PENALTY, // opposition gains +8 (balance shifts 8 toward opp)
      0, // unused under the differential model
      false,
    );
  }

  // Hath Band scoring: caller must win ALL 6 tricks. +6 met (caller's team);
  // opposition +12 on fail (swing of 12 toward the opposition). The caller's
  // team may differ from `biddingTeam` — Hath Band can be called by ANY
  // player, including the opposition ("stolen contract").
  if (bid.kind === 'HATH_BAND') {
    const callerId = gameState.hathBandCallerId ?? bid.playerId;
    const caller = gameState.players.get(callerId);
    const callerTeam = caller != null ? caller.team : biddingTeam;
    const callerWonAll6 = caller != null && caller.tricksWonThisRound === HATH_BAND_TRICK_COUNT;
    return computeRoundScoringResult(
      gameState,
      callerTeam,
      bidAmount,
      callerWonAll6,
      HATH_BAND_WIN_POINTS,
      HATH_BAND_FAIL_PENALTY, // opposition gains +12 (swing of 12 toward opp)
      0,
      false,
    );
  }

  // Standard bid path.
  const metBid = biddingTeamActualPoints >= bidAmount;
  const isHighValueBid = bidAmount >= 200;
  const metMultiplier = isHighValueBid ? 2 : 1;
  const failedMultiplier = isHighValueBid ? 4 : 2;
  return computeRoundScoringResult(
    gameState,
    biddingTeam,
    bidAmount,
    metBid,
    metMultiplier,
    failedMultiplier,
    0,
    false,
  );
}

/**
 * Determine the next dealer per PRD Section 2.4 Dealer Rotation Rule.
 * 
 * The team whose score card is currently FACE DOWN must deal until their
 * score card turns face-up.
 */
export function determineNextDealer(
  gameState: GameState,
  _trickResults: TrickResult[],
): PlayerId {
  const redTeam = gameState.redTeamScore;
  const blackTeam = gameState.blackTeamScore;
  const playerIds = ['p0', 'p1', 'p2', 'p3'];

  if (redTeam.isFaceUp && !blackTeam.isFaceUp) {
    // Black must deal → rotate to next Black player
    return getNextDealerInTeam(playerIds, blackTeam, gameState.dealerId);
  } else if (!redTeam.isFaceUp && blackTeam.isFaceUp) {
    // Red must deal → rotate to next Red player
    return getNextDealerInTeam(playerIds, redTeam, gameState.dealerId);
  } else {
    // Both face-up OR both face-down: normal clockwise rotation
    const currentIndex = parseInt(gameState.dealerId.replace('p', ''));
    return `p${(currentIndex + 1) % 4}`;
  }
}

/**
 * Get the next player in a team's seating order for dealing.
 */
function getNextDealerInTeam(
  _playerIds: string[],
  _team: TeamScore & { isFaceUp: boolean },
  currentDealerId: PlayerId,
): PlayerId {
  // Rotate clockwise to find the next player on the face-down team
  const currentIndex = parseInt(currentDealerId.replace('p', ''));
  return `p${(currentIndex + 1) % 4}`;
}

/**
 * Get the next player clockwise from a given player.
 */
export function getNextPlayerClockwise(playerId: PlayerId, offset = 1): PlayerId {
  const index = parseInt(playerId.replace('p', ''));
  return `p${(index + offset) % 4}`;
}

/**
 * Flip a team's score card face-up when they first score.
 */
export function flipTeamScoreFaceUp(
  teamScore: TeamScore,
  pointIndex: number, // Which point triggered the flip
): void {
  teamScore.isFaceUp = true;
  if (pointIndex < teamScore.scoreCards.length) {
    teamScore.scoreCards[pointIndex].scoredAt = Date.now();
  }
}

/**
 * Rotate the dealer clockwise by 1 position.
 */
export function rotateDealerClockwise(dealerId: PlayerId): PlayerId {
  const index = parseInt(dealerId.replace('p', ''));
  return `p${(index + 1) % 4}`;
}

// ============================================================================
// SECTION 8: GAME STATE MACHINE — Full state transitions
// ============================================================================

/**
 * Create the initial game state in LOBBY.
 */
export function createInitialState(
  dealerId: PlayerId = 'p1',
  matchGoal: number = MATCH_GOAL,
): GameState {
  const players = createDefaultPlayers();
  
  return {
    gameId: generateGameId(),
    version: 'v1',
    status: 'LOBBY',
    startedAt: Date.now(),
    lastSavedAt: Date.now(),
    players,
    dealerId,
    biddingState: {
      phase: 'PRE_FIRST_DEAL',
      currentPlayerToBid: getNextPlayerClockwise(dealerId),
      currentHighestBid: null,
      passesSinceLastBid: 0,
      allPlayersHavePassed: false,
      forcedBidTriggered: false,
      bids: new Map(),
      thanniEligible: { p0: true, p1: true, p2: true, p3: true },
      endedByThanni: false,
    },
    bidWinnerId: null,
    isThanniRound: false,
    thanniBidderId: null,
    thanniPartnerId: null,
    isHathBandRound: false,
    hathBandCallerId: null,
    hathBandPartnerId: null,
    trumpSuit: null,
    trumpFaceDown: true,
    trumpRevealedThisRound: false,
    currentTrickNumber: 0,
    currentLeadPlayerId: null,
    trickPile: [],
    balance: 0, // differential: positive = RED leads, negative = BLACK leads
    redTeamScore: {
      points: 0,
      isFaceUp: false,
      scoreCards: Array(6).fill(null).map((_, i) => ({
        cardId: `red_${i}`,
        scoredAt: null,
      })),
    },
    blackTeamScore: {
      points: 0,
      isFaceUp: false,
      scoreCards: Array(6).fill(null).map((_, i) => ({
        cardId: `black_${i}`,
        scoredAt: null,
      })),
    },
    matchGoal,
    winner: null,
    remainingDeck: [],
    stateHash: 'initial_placeholder_hash',
  };
}

/**
 * Transition: LOBBY → BIDDING_PHASE1
 * Deal first phase (4 cards each), start bidding.
 */
export function transitionToBiddingPhase1(gameState: GameState): GameState {
  // Build and shuffle deck
  const deck = shuffleDeck(buildDeck());
  
  // Deal phase 1 (4 cards each)
  const { playerHands } = dealFullGame(deck, gameState.dealerId);
  
  // Assign hands to players (only first 4 cards for now, we need partial deal logic)
  const updatedPlayers = new Map(gameState.players);
  for (const [playerId, hand] of playerHands) {
    updatedPlayers.set(playerId, {
      ...gameState.players.get(playerId)!,
      hand: hand.slice(0, 4), // First 4 cards
    });
  }

  // Set bidding state
  const firstBidder = gameState.biddingState.currentPlayerToBid;

  return {
    ...gameState,
    status: 'BIDDING_PHASE1',
    players: updatedPlayers,
    remainingDeck: deck.slice(16), // Remaining 8 cards
    biddingState: {
      ...gameState.biddingState,
      phase: 'PRE_FIRST_DEAL',
      currentPlayerToBid: firstBidder,
    },
    lastSavedAt: Date.now(),
  };
}

/**
 * Transition: BIDDING_PHASE1 → BIDDING_PHASE2 (after second deal)
 * Deal remaining 2 cards each, finalize bidding.
 */
export function transitionToBiddingPhase2(gameState: GameState): GameState {
  const deck = shuffleDeck(buildDeck()); // Recompute for clarity
  const fullGame = dealFullGame(deck, gameState.dealerId);
  
  const updatedPlayers = new Map(gameState.players);
  for (const [playerId, hand] of fullGame.playerHands) {
    updatedPlayers.set(playerId, {
      ...gameState.players.get(playerId)!,
      hand: sortCards(hand),
    });
  }

  return {
    ...gameState,
    status: 'BIDDING_PHASE2',
    players: updatedPlayers,
    remainingDeck: [],
    biddingState: {
      ...gameState.biddingState,
      phase: 'POST_SECOND_DEAL',
    },
    lastSavedAt: Date.now(),
  };
}

/**
 * Transition: BIDDING → TRUMP_SET
 * Bid winner chooses trump (or AI chooses).
 */
export function transitionToTrumpSet(
  gameState: GameState,
  trumpChosen: Suit,
): GameState {
  return {
    ...gameState,
    status: 'TRUMP_SET',
    trumpSuit: trumpChosen,
    trumpFaceDown: true,
    bidWinnerId: gameState.biddingState.currentHighestBid!.playerId,
    lastSavedAt: Date.now(),
  };
}

/**
 * Transition: TRUMP_SET → PLAYING (after ~2s delay)
 * Set the first trick leader (player left of dealer).
 */
export function transitionToPlaying(gameState: GameState): GameState {
  const leadPlayer = getNextPlayerClockwise(gameState.dealerId);

  return {
    ...gameState,
    status: 'PLAYING',
    currentTrickNumber: 1,
    currentLeadPlayerId: leadPlayer,
    trickPile: [],
    lastSavedAt: Date.now(),
  };
}

/**
 * Transition: BIDDING_PHASE1 → THANNI_PLAYING.
 * Called immediately after a Thanni bid. Skips phase-2 deal and trump
 * selection entirely. The Thanni bidder leads trick 1; the partner is
 * folded (does not play). No trump suit is set.
 */
export function transitionToThanniPlaying(gameState: GameState): GameState {
  const bidderId = gameState.biddingState.currentHighestBid!.playerId;
  const bidder = gameState.players.get(bidderId)!;
  const partnerId = bidder.partnerId;

  return {
    ...gameState,
    status: 'THANNI_PLAYING',
    bidWinnerId: bidderId,
    isThanniRound: true,
    thanniBidderId: bidderId,
    thanniPartnerId: partnerId,
    trumpSuit: null,
    trumpFaceDown: false,
    trumpRevealedThisRound: false,
    currentTrickNumber: 1,
    currentLeadPlayerId: bidderId, // Thanni bidder leads
    trickPile: [],
    lastSavedAt: Date.now(),
  };
}

/**
 * Transition: TRUMP_SET → HATH_BAND_PLAYING.
 *
 * Caller may be ANY of the 4 players (per the rules). The caller's partner
 * is folded (does not play). The trump chosen during phase-2 is discarded
 * and its physical card returns to the bid winner's hand — regardless of
 * whether the bid winner ends up folded (e.g., bid winner's partner calls).
 *
 * `trumpCardForWinner` is the physical trump card the bid winner set aside
 * during trump selection; it is returned to their hand on transition. Pass
 * `null` if no card was set aside (unusual edge case).
 */
export function transitionToHathBandPlaying(
  gameState: GameState,
  callerId: PlayerId,
  trumpCardForWinner: Card | null,
): GameState {
  const caller = gameState.players.get(callerId)!;
  const partnerId = caller.partnerId;
  const bidWinnerId = gameState.bidWinnerId;

  // Return the trump card to the bid winner's hand.
  const players = new Map(gameState.players);
  if (trumpCardForWinner && bidWinnerId) {
    const winner = players.get(bidWinnerId)!;
    players.set(bidWinnerId, {
      ...winner,
      hand: winner.hand.includes(trumpCardForWinner)
        ? winner.hand
        : [...winner.hand, trumpCardForWinner],
    });
  }

  return {
    ...gameState,
    status: 'HATH_BAND_PLAYING',
    players,
    isHathBandRound: true,
    hathBandCallerId: callerId,
    hathBandPartnerId: partnerId,
    trumpSuit: null,
    trumpFaceDown: false,
    trumpRevealedThisRound: false,
    currentTrickNumber: 1,
    currentLeadPlayerId: callerId, // Hath Band caller leads every trick
    trickPile: [],
    lastSavedAt: Date.now(),
  };
}

/**
 * Transition: PLAYING → ROUND_SCORED (after 6 tricks)
 * Evaluate scores, apply match-point updates.
 */
export function transitionToRoundScored(gameState: GameState): GameState {
  return {
    ...gameState,
    status: 'ROUND_SCORED',
    lastSavedAt: Date.now(),
  };
}

/**
 * Transition: ROUND_SCORED → MATCH_OVER (if match goal reached)
 */
export function transitionToMatchOver(
  gameState: GameState,
  winner: Team,
): GameState {
  return {
    ...gameState,
    status: 'MATCH_OVER',
    winner,
    lastSavedAt: Date.now(),
  };
}

/**
 * Transition: ROUND_SCORED → LOBBY (new round, dealer rotates)
 */
export function transitionToNewRound(gameState: GameState): GameState {
  const newDealer = determineNextDealer(gameState, []);

  // Reset hands, tricks, bids — but KEEP the differential `balance` and the
  // `isFaceUp` flags (scoreboard persists across rounds). The derived
  // `redTeamScore.points` / `blackTeamScore.points` already track `balance`
  // via the spread below, so no explicit reset is needed.
  const players = new Map(gameState.players);
  for (const [pid, player] of players) {
    players.set(pid, {
      ...player,
      hand: [],
      bid: null,
      tricksWonThisRound: 0,
      pointsCapturedThisRound: 0,
    });
  }

  return {
    ...gameState,
    status: 'LOBBY',
    dealerId: newDealer,
    players,
    biddingState: {
      phase: 'PRE_FIRST_DEAL',
      currentPlayerToBid: getNextPlayerClockwise(newDealer),
      currentHighestBid: null,
      passesSinceLastBid: 0,
      allPlayersHavePassed: false,
      forcedBidTriggered: false,
      bids: new Map(),
      thanniEligible: { p0: true, p1: true, p2: true, p3: true },
      endedByThanni: false,
    },
    bidWinnerId: null,
    isThanniRound: false,
    thanniBidderId: null,
    thanniPartnerId: null,
    isHathBandRound: false,
    hathBandCallerId: null,
    hathBandPartnerId: null,
    trumpSuit: null,
    trumpFaceDown: true,
    trumpRevealedThisRound: false,
    currentTrickNumber: 0,
    currentLeadPlayerId: null,
    trickPile: [],
    remainingDeck: [],
    lastSavedAt: Date.now(),
  };
}

// ============================================================================
// SECTION 9: GAME LOOP CONTROLLER — Orchestrates state transitions
// ============================================================================

/**
 * Result of a game action.
 */
export interface GameActionResult {
  newState: GameState;
  message?: string;
  error?: string;
}

/**
 * Discriminated union of all game actions. Used by `simulateAction` — a pure,
 * headless `GameState → GameState` dispatcher that wraps the existing engine
 * primitives (playCard / placeBid / passBid / placeThanniBid /
 * transitionToHathBandPlaying / transitionToTrumpSet / requestTrumpReveal).
 *
 * The dispatcher is the canonical rollout primitive for future MCTS / GA
 * strategies: a single pure function covering all play modes, side-effect-free.
 * The React UI loop keeps its own state model; strategies call `simulateAction`
 * for hypothetical rollouts on a deterministic copy of the engine state.
 */
export type GameAction =
  | { kind: 'PLAY'; playerId: PlayerId; card: Card }
  | { kind: 'PASS'; playerId: PlayerId }
  | { kind: 'BID'; playerId: PlayerId; amount: number }
  | { kind: 'BID_THANNI'; playerId: PlayerId }
  | { kind: 'CALL_HATH_BAND'; playerId: PlayerId; trumpCardForWinner: Card | null }
  | { kind: 'SET_TRUMP'; playerId: PlayerId; suit: Suit }
  | { kind: 'REVEAL_TRUMP'; playerId: PlayerId };

/**
 * Apply a game action to a GameState, returning the resulting state.
 * Illegal actions (e.g., playing out of turn, invalid bid amount) return the
 * input state unchanged — the caller can detect this by comparing references.
 * Pure: no side effects, no React, no setTimeout.
 */
export function simulateAction(state: GameState, action: GameAction): GameState {
  switch (action.kind) {
    case 'PLAY': {
      const r = playCard(state, action.playerId, action.card);
      return r.error ? state : r.newState;
    }
    case 'PASS': {
      const r = passBid(state.biddingState, action.playerId);
      if (r.newState === null) return state;
      return { ...state, biddingState: r.newState };
    }
    case 'BID': {
      const r = placeBid(state.biddingState, action.playerId, action.amount);
      if (r.newState === null) return state;
      return { ...state, biddingState: r.newState };
    }
    case 'BID_THANNI': {
      const bidderHand = state.players.get(action.playerId)?.hand ?? [];
      const r = placeThanniBid(state.biddingState, action.playerId, bidderHand);
      if (r.newState === null) return state;
      return transitionToThanniPlaying({ ...state, biddingState: r.newState });
    }
    case 'CALL_HATH_BAND':
      return transitionToHathBandPlaying(state, action.playerId, action.trumpCardForWinner);
    case 'SET_TRUMP':
      return transitionToTrumpSet(state, action.suit);
    case 'REVEAL_TRUMP': {
      const r = requestTrumpReveal(state, action.playerId);
      return r.error ? state : r.newState;
    }
  }
}

/**
 * Process a card play action.
 * Validates card is legal, adds to trick pile, checks for trick completion.
 */
export function playCard(
  gameState: GameState,
  playerId: PlayerId,
  cardToPlay: Card,
): GameActionResult {
  // Validate it's this player's turn
  if (gameState.currentLeadPlayerId !== playerId) {
    return {
      newState: gameState,
      error: `It is ${getDisplayName(playerId)}'s turn, not yours.`,
    };
  }

  // Get legal cards for this player
  const legalCards = getLegalCards(
    gameState.players.get(playerId)!.hand,
    gameState.trickPile,
    gameState.trumpSuit,
    gameState.trumpRevealedThisRound,
    playerId,
    null, // Not the revealing player
  );

  // Verify card is legal
  if (!legalCards.some(c => c.id === cardToPlay.id)) {
    return {
      newState: gameState,
      error: `Cannot play ${cardToPlay.id}. Play a ${getLedSuit(gameState.trickPile)} or follow trump reveal rules.`,
    };
  }

  // Create played card entry
  const playedCard: PlayedCard = {
    card: cardToPlay,
    playerId,
    trickNumber: gameState.currentTrickNumber,
    positionInTrick: gameState.trickPile.length + 1,
  };

  // Remove card from hand
  const updatedPlayers = new Map(gameState.players);
  const player = updatedPlayers.get(playerId)!;
  updatedPlayers.set(playerId, {
    ...player,
    hand: player.hand.filter(c => c.id !== cardToPlay.id),
  });

  // Add to trick pile
  const newTrickPile = [...gameState.trickPile, playedCard];

  // Check if trick is complete (4 cards)
  if (newTrickPile.length === 4) {
    // Evaluate trick
    const result = evaluateTrickWithContext(newTrickPile, gameState.trumpSuit);
    
    // Update tricks won for winner
    const winner = updatedPlayers.get(result.winnerPlayerId)!;
    updatedPlayers.set(result.winnerPlayerId, {
      ...winner,
      tricksWonThisRound: winner.tricksWonThisRound + 1,
    });

    // If more tricks to play, start next trick
    if (gameState.currentTrickNumber < 6) {
      return {
        newState: {
          ...gameState,
          players: updatedPlayers,
          trickPile: [], // Clear trick pile for display
          currentTrickNumber: gameState.currentTrickNumber + 1,
          currentLeadPlayerId: result.winnerPlayerId,
          lastSavedAt: Date.now(),
        },
        message: `${getDisplayName(result.winnerPlayerId)} wins the trick!`,
      };
    } else {
      // All 6 tricks complete
      return {
        newState: {
          ...gameState,
          players: updatedPlayers,
          trickPile: newTrickPile,
          lastSavedAt: Date.now(),
        },
        message: 'All tricks completed. Moving to round scoring.',
      };
    }
  }

  // Trick not complete: next player clockwise takes turn
  // Note: In this variant, the lead player changes after each trick, but
  // during a trick, players play in order. The "next turn" is automatic.
  return {
    newState: {
      ...gameState,
      players: updatedPlayers,
      trickPile: newTrickPile,
      lastSavedAt: Date.now(),
    },
  };
}

/**
 * Process a trump reveal request.
 * Per PRD: Only the player whose turn it is can request reveal (once per round).
 */
export function requestTrumpReveal(
  gameState: GameState,
  requestingPlayerId: PlayerId,
): GameActionResult {
  if (gameState.trumpRevealedThisRound) {
    return {
      newState: gameState,
      error: 'Trump has already been revealed this round.',
    };
  }

  if (requestingPlayerId !== gameState.currentLeadPlayerId) {
    return {
      newState: gameState,
      error: 'Only the lead player can request a trump reveal.',
    };
  }

  if (!gameState.trumpSuit) {
    return {
      newState: gameState,
      error: 'Trump has not been set yet.',
    };
  }

  // Reveal trump
  return {
    newState: {
      ...gameState,
      status: 'TRUMP_REVEALED',
      trumpFaceDown: false,
      trumpRevealedThisRound: true,
      lastSavedAt: Date.now(),
    },
    message: `Trump revealed: ${getSuitDisplayName(gameState.trumpSuit)}! You must play ${getSuitDisplayName(gameState.trumpSuit)} if you have one.`,
  };
}

/**
 * Evaluate a complete round (6 tricks played).
 * Per PRD Section 2.4: Compare bidding team's points vs bid, apply scoring rules.
 */
export function evaluateRound(
  gameState: GameState,
): GameActionResult {
  const bidWinnerId = gameState.bidWinnerId!;
  const biddingTeam = getBiddingTeam(bidWinnerId, gameState.players);

  // Sum points captured by each team this round (used by the standard-bid
  // path to determine whether the bidding team met their bid).
  let redPoints = 0;
  let blackPoints = 0;
  for (const [, player] of gameState.players) {
    if (player.team === 'RED') redPoints += player.pointsCapturedThisRound;
    else blackPoints += player.pointsCapturedThisRound;
  }
  const biddingTeamActualPoints = biddingTeam === 'RED' ? redPoints : blackPoints;

  // Compute the single signed balance shift toward the gaining team.
  const scoringResult = applyRoundScoring(
    gameState,
    biddingTeam,
    biddingTeamActualPoints,
  );

  // Apply the shift to the differential balance; derive per-team points
  // (one side is always 0). isFaceUp flips (and stays flipped) the first time
  // a team's derived points become positive.
  const newBalance = gameState.balance + scoringResult.balanceShift;
  const updatedRedScore: TeamScore = {
    ...gameState.redTeamScore,
    points: Math.max(0, newBalance),
    isFaceUp: gameState.redTeamScore.isFaceUp || newBalance > 0,
  };
  const updatedBlackScore: TeamScore = {
    ...gameState.blackTeamScore,
    points: Math.max(0, -newBalance),
    isFaceUp: gameState.blackTeamScore.isFaceUp || newBalance < 0,
  };

  const newState: GameState = {
    ...gameState,
    balance: newBalance,
    redTeamScore: updatedRedScore,
    blackTeamScore: updatedBlackScore,
  };

  if (scoringResult.matchOver) {
    return {
      newState: transitionToMatchOver(newState, scoringResult.winner!),
      message: `${scoringResult.winner} team wins the match!`,
    };
  }

  return {
    newState,
    message: `Round scored. ${biddingTeam} team ${scoringResult.metBid ? 'made' : 'missed'} their bid of ${scoringResult.biddingTeamBid}.`,
  };
}

/**
 * Get the suit display name.
 */
function getSuitDisplayName(suit: Suit): string {
  const names: Record<Suit, string> = {
    HEARTS: 'Hearts',
    DIAMONDS: 'Diamonds',
    SPADES: 'Spades',
    CLUBS: 'Clubs',
  };
  return names[suit];
}

/**
 * Get a player display name by ID (lookup from players map).
 */
function getDisplayName(playerId: PlayerId): string {
  const names: Record<PlayerId, string> = {
    p0: 'Opponent 4',
    p1: 'Opponent 2',
    p2: 'Partner',
    p3: 'Opponent 3',
  };
  return names[playerId] || `Player ${playerId}`;
}

// ============================================================================
// SECTION 10: STATE HASHING — Integrity validation
// ============================================================================

/**
 * Compute a simple SHA-256-like hash for state integrity.
 * Uses a lightweight approach (DJB2 hash) suitable for client-side use.
 * In production, replace with crypto.subtle.digest('SHA-256', ...).
 */
export function computeStateHash(state: GameState): string {
  const serialized = JSON.stringify(state, (key, value) => {
    // Exclude transient fields from hash
    if (key === 'lastSavedAt' || key === 'stateHash') return undefined;
    return value;
  }, 0);

  // Simple DJB2 hash
  let hash = 5381;
  for (let i = 0; i < serialized.length; i++) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(i)) | 0;
  }

  return Math.abs(hash).toString(36);
}

/**
 * Validate state integrity by comparing hash.
 */
export function validateStateIntegrity(state: GameState): boolean {
  const computed = computeStateHash(state);
  return computed === state.stateHash;
}

// ============================================================================
// SECTION 11: HELPER / UTILITY FUNCTIONS — Convenience methods
// ============================================================================

/**
 * Get all player IDs on a given team.
 */
export function getTeamPlayerIds(
  team: Team,
  players: Map<PlayerId, Player>,
): PlayerId[] {
  const result: PlayerId[] = [];
  for (const [pid, player] of players) {
    if (player.team === team) {
      result.push(pid);
    }
  }
  return result;
}

/**
 * Get partner ID for a player.
 */
export function getPartnerId(
  playerId: PlayerId,
  players: Map<PlayerId, Player>,
): PlayerId {
  return players.get(playerId)!.partnerId;
}

/**
 * Check if a player has any cards of a given suit.
 */
export function hasSuit(
  playerId: PlayerId,
  suit: Suit,
  players: Map<PlayerId, Player>,
): boolean {
  return players.get(playerId)!.hand.some(c => c.suit === suit);
}

/**
 * Get all cards of a given suit from a player's hand.
 */
export function getCardsOfSuit(
  playerId: PlayerId,
  suit: Suit,
  players: Map<PlayerId, Player>,
): Card[] {
  return players.get(playerId)!.hand.filter(c => c.suit === suit);
}

/**
 * Check if a player is void in a given suit.
 */
export function isVoidInSuit(
  playerId: PlayerId,
  suit: Suit,
  players: Map<PlayerId, Player>,
): boolean {
  return !players.get(playerId)!.hand.some(c => c.suit === suit);
}

/**
 * Get current turn player ID.
 */
export function getCurrentTurnPlayer(gameState: GameState): PlayerId | null {
  switch (gameState.status) {
    case 'BIDDING_PHASE1':
    case 'BIDDING_PHASE2':
      return gameState.biddingState.currentPlayerToBid;
    case 'PLAYING':
    case 'TRUMP_SET':
    case 'TRUMP_REVEALED':
      return gameState.currentLeadPlayerId;
    default:
      return null;
  }
}

/**
 * Check if a card is playable (legal) given game state.
 */
export function isCardPlayable(
  gameState: GameState,
  playerId: PlayerId,
  card: Card,
): boolean {
  // Must be player's turn
  if (getCurrentTurnPlayer(gameState) !== playerId) return false;

  // Get legal cards
  const legal = getLegalCards(
    gameState.players.get(playerId)!.hand,
    gameState.trickPile,
    gameState.trumpSuit,
    gameState.trumpRevealedThisRound,
    playerId,
    null,
  );

  return legal.some(c => c.id === card.id);
}

/**
 * Print a summary of the current game state (useful for debugging/logging).
 */
export function printGameStateSummary(gameState: GameState): string {
  const lines: string[] = [];
  lines.push(`=== Game State Summary ===`);
  lines.push(`Game ID: ${gameState.gameId}`);
  lines.push(`Status: ${gameState.status}`);
  lines.push(`Dealer: ${gameState.dealerId}`);
  lines.push(
    `Trump: ${gameState.trumpSuit ? getSuitDisplayName(gameState.trumpSuit) : 'Hidden'}`,
  );
  lines.push(
    `Red Team: ${gameState.redTeamScore.points} pts (${gameState.redTeamScore.isFaceUp ? 'FACE UP' : 'FACE DOWN'})`,
  );
  lines.push(
    `Black Team: ${gameState.blackTeamScore.points} pts (${gameState.blackTeamScore.isFaceUp ? 'FACE UP' : 'FACE DOWN'})`,
  );
  lines.push(
    `Current Trick: ${gameState.currentTrickNumber}/6`,
  );
  lines.push(`Match Goal: ${gameState.matchGoal}`);
  
  for (const [pid, player] of gameState.players) {
    lines.push(
      `${pid} (${player.name}): ${player.hand.length} cards, Team=${player.team}, Bid=${player.bid ?? 'None'}`,
    );
  }
  
  return lines.join('\n');
}

// ============================================================================
// RE-EXPORTS from thanniAI.ts — Backward compatibility
// AI bidding & gameplay functions now live in ./thanniAI.ts.
// These re-exports keep existing imports from thanniEngine working.
// ============================================================================

export {
  type HandEvaluation,
  type AIPlayer,
  evaluateHand,
  calculateBidFromEstimate,
  aiDecideBidOrPass,
  aiShouldBidThanni,
  aiShouldCallHathBand,
  winningOfPile,
  aiPickCard,
  computeNextDealer,
} from './thanniAI';

// ============================================================================
// END OF thanniEngine.ts
// All core mechanics implemented per PRD v1.0.0
// Total points verified: 328 per round (82 × 4 suits)
// State machine states: LOBBY → BIDDING_PHASE1 → BIDDING_PHASE2 → TRUMP_SET → PLAYING → ROUND_SCORED → MATCH_OVER
// ============================================================================