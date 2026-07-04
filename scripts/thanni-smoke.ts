/**
 * Synthetic smoke tests for the Thanni sweep pre-check + thanni bid flow.
 * Run via:  npx tsx scripts/thanni-smoke.ts
 */

import {
  buildDeck,
  sortCards,
  isGuaranteedSweep,
  isValidThanniBid,
  placeThanniBid,
  placeBid,
  passBid,
  createInitialState,
  transitionToBiddingPhase1,
  transitionToThanniPlaying,
  transitionToHathBandPlaying,
  isHathBandGuaranteedSweep,
  applyRoundScoring,
  evaluateTrickWithContext,
  determineTrickWinner,
  simulateAction,
  THANNI_WIN_POINTS,
  THANNI_FAIL_PENALTY,
  HATH_BAND_WIN_POINTS,
  HATH_BAND_FAIL_PENALTY,
  HATH_BAND_TRICK_COUNT,
  type Card,
  type GameState,
  type PlayedCard,
  type PlayerId,
} from '../thanniEngine';
import { HeuristicAI, getAIStrategy, getAISeatMode, setAISeatMode, resetAIMode, isDefaultMode, DEFAULT_MODE, type CardplayView, type BiddingView, GaAI, DEFAULT_GENOME } from '../src/ai';

type Case = { name: string; fn: () => void };
const cases: Case[] = [];

function assertEq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${name}: expected ${e}, got ${a}`);
  console.log(`  ✓ ${name}`);
}

const byId = (deck: Card[], ids: string[]): Card[] =>
  ids.map(id => deck.find(c => c.id === id)!).filter(Boolean);

// Case 1: 4 Jacks (one per suit) → guaranteed sweep → disallowed.
cases.push({
  name: '4 of a kind (4 Jacks of distinct suits) is a guaranteed sweep',
  fn: () => {
    const deck = buildDeck();
    const hand = byId(deck, ['JH', 'JD', 'JS', 'JC']);
    assertEq('hand length', hand.length, 4);
    const result = isGuaranteedSweep(hand);
    assertEq('isGuaranteedSweep', result, true);
  },
});

// Case 2: Weak hand (low cards across suits) → not guaranteed.
cases.push({
  name: '4 low cards spread across suits is NOT a guaranteed sweep',
  fn: () => {
    const deck = buildDeck();
    // Q of each suit — pretty weak, opponents could have J or 9 of those suits.
    const hand = byId(deck, ['QH', 'QD', 'QS', 'QC']);
    const result = isGuaranteedSweep(hand);
    assertEq('isGuaranteedSweep (4 low queens)', result, false);
  },
});

// Case 3: 3 Jacks + 1 Queen (one pair) — likely not guaranteed
cases.push({
  name: '3 Jacks + 1 Queen (mixed suits) is NOT guaranteed (risk is real)',
  fn: () => {
    const deck = buildDeck();
    const hand = byId(deck, ['JH', 'JD', 'JS', 'QC']);
    const result = isGuaranteedSweep(hand);
    assertEq('isGuaranteedSweep (3 Jacks + 1 Queen)', result, false);
  },
});

// Case 4: All 4 cards are Jack + 9 + A + 10 in the SAME suit (so bidder has all top hearts).
//   Opponents cannot have any hearts higher than the bidder's lowest hearts (which is 10)?? Actually, opp could have K ♥  But it can't beat 10 in led-suit (K=6 < 10=10). Hmm 9=20 > 10=10. So opp could have the 9♥ which beats the bidder's 10♥. But the bidder leads 10♥ AFTER their higher cards have been played (per "descending lead" strategy), forcing opps to follow with their hearts — they might've been forced to play 9♥ earlier when bidder led a higher heart.
//   Hmm this is subtle. Let me re-check: cards in HEARTS: J=30, 9=20, A=11, 10=10, K=6, Q=5. Bidder has {JH, 9H, AH, 10H}. Opps collectively have {KH, QH} (2 hearts) plus 6 cards of other suits.
//   Bidder leads JH first. OpA has KH or QH or none — must follow with hearts if has. highest opp heart < JH so JH wins.
//   Next bidder leads 9H. Opp remaining heart (if they had KH or QH originally) is lower than 9H. 9H wins.
//   Next bidder leads AH. Opp has no hearts left (depleted). They slough off-suit. AH wins.
//   Next bidder leads 10H. Opp slough. 10H wins.
//   YES — guaranteed sweep.
cases.push({
  name: 'Top-4 of one suit (J, 9, A, 10 of ♥) IS a guaranteed sweep',
  fn: () => {
    const deck = buildDeck();
    const hand = byId(deck, ['JH', '9H', 'AH', '10H']);
    const result = isGuaranteedSweep(hand);
    assertEq('isGuaranteedSweep (top-4 hearts)', result, true);
  },
});

// Case 5: All 4 cards are J, 9, A, K of one suit — even though the 10♥ is unseen,
// bidder leads J → 9 → A → K. Opp hearts (10, Q) must follow on J & 9 leads
// and they're rank-below bidder's leads. By the time bidder plays K, opps are
// void of hearts and slough off-suit, so KH (the only heart remaining) wins
// the trick. This IS a guaranteed sweep.
cases.push({
  name: 'J, 9, A, K of one suit IS a guaranteed sweep (descending lead exhausts opp hearts)',
  fn: () => {
    const deck = buildDeck();
    const hand = byId(deck, ['JH', '9H', 'AH', 'KH']);
    const result = isGuaranteedSweep(hand);
    assertEq('isGuaranteedSweep (J/9/A/K of hearts)', result, true);
  },
});

// Case 5b: A genuinely vulnerable hand — J, 9, 10, K of one suit. Opp could
// hold A♥ (rank-11) which beats the 9♥ (rank-20)? No — wait, pointValue A=11, 9=20,
// so 9 beats A. But what about Q♥ beats? No. The bidder plays JH first (opp plays
// A♥ or Q♥, JH wins). Then bidder plays 9H (opp's other heart, A♥ or Q♥, rank-5;
// JH played uses A♥=11 still? Wait rank-by-pointValue.
// Cards in hearts: J=30, 9=20, A=11, 10=10, K=6, Q=5. Bidder has {JH, 9H, 10H, KH}.
// Unseen hearts: AH and QH (2 cards). Opps may have both.
// Bidder leads JH: opp plays one of AH/QH (forced). JH wins.
// Bidder leads 9H: opp plays other heart (QH or AH). 9H (=20) > AH (=11) > QH (=5). 9H wins.
// Bidder leads 10H: opp void hearts. Slough. 10H wins (led suit = hearts, only 10H in play).
// Bidder leads KH: opp void. Slough. KH wins. Guaranteed sweep!
// So this is ALSO a guaranteed sweep — pointValue ordering makes 9H a near-top card.
cases.push({
  name: 'J, 9, 10, K of one suit IS also a guaranteed sweep',
  fn: () => {
    const deck = buildDeck();
    const hand = byId(deck, ['JH', '9H', '10H', 'KH']);
    const result = isGuaranteedSweep(hand);
    assertEq('isGuaranteedSweep (J/9/10/K of hearts)', result, true);
  },
});

// Case 5c: A genuinely vulnerable hand — Jack, Queen, 10, King all of one suit.
// Unseen: 9 and A of hearts. Opp could have 9♥ (=20 points) which beats any of
// bidder's heart cards (highest is J=30; second is K=6; Q=5; 10=10).
// Bidder leads JH first (beats anything opps play). Opps play their lowest heart
// (forced follow) — could play A♥ (=11) or 9♥ (=20) — both lose to JH=30.
// Bidder then leads KH (=6). Opps may still hold 9♥ (=20) → beats KH → bidder loses.
cases.push({
  name: 'J, K, Q, 10 of one suit is NOT guaranteed (9♥ of unseen opp beats K)',
  fn: () => {
    const deck = buildDeck();
    const hand = byId(deck, ['JH', 'KH', 'QH', '10H']);
    const result = isGuaranteedSweep(hand);
    assertEq('isGuaranteedSweep (J/K/Q/10 of hearts)', result, false);
  },
});

// Case 6: placeThanniBid on a "thanni-eligible" round should succeed.
cases.push({
  name: 'Placing a Thanni bid on first action succeeds and ends bidding',
  fn: () => {
    const state: GameState = (() => {
      const base = createInitialState('p1');
      return transitionToBiddingPhase1(base);
    })();

    // p2 is first bidder (next clockwise from dealer p1).
    const p2Hand = state.players.get('p2')!.hand;
    const v = isValidThanniBid(state.biddingState, 'p2', p2Hand);
    if (!v.ok) console.log('   (sweep check blocked p2 hand:', v.error, ')');
    // Make sure to choose a hand that is not a guaranteed sweep:
    const deck = buildDeck();
    const weakHand = byId(deck, ['QH', 'QD', 'QS', 'QC']);
    // Replace player's hand with the weak hand so validation passes for sure.
    const patched: GameState = {
      ...state,
      players: new Map(state.players).set('p2', { ...state.players.get('p2')!, hand: weakHand }),
    };
    const v2 = isValidThanniBid(patched.biddingState, 'p2', weakHand);
    if (!v2.ok) throw new Error(`Expected valid thanni bid, got: ${v2.error}`);
    const res = placeThanniBid(patched.biddingState, 'p2', weakHand);
    if (res.error) throw new Error(`placeThanniBid errored: ${res.error}`);
    if (!res.newState!.endedByThanni) throw new Error('endedByThanni not set');
    if (res.newState!.currentHighestBid!.kind !== 'THANNI') throw new Error('bid kind is not THANNI');
    if (res.newState!.currentHighestBid!.playerId !== 'p2') throw new Error('bidder is not p2');
  },
});

// Case 7: After a pass, the player is no longer thanni-eligible.
cases.push({
  name: 'A pass consumes Thanni eligibility',
  fn: () => {
    let state: GameState = (() => {
      const base = createInitialState('p1');
      return transitionToBiddingPhase1(base);
    })();
    state = { ...state, players: new Map(state.players) };
    // p2 passes (first to bid)
    const r = passBid(state.biddingState, 'p2');
    state = { ...state, biddingState: r.newState };
    if (state.biddingState.thanniEligible['p2'] !== false) throw new Error('p2 should be ineligible after passing');
  },
});

// Case 8: After a numeric bid, the bidder is no longer thanni-eligible.
cases.push({
  name: 'A numeric bid also consumes Thanni eligibility',
  fn: () => {
    let state = createInitialState('p1');
    state = transitionToBiddingPhase1(state);
    const r = placeBid(state.biddingState, 'p2', 150);
    state = { ...state, biddingState: r.newState! };
    if (state.biddingState.thanniEligible['p2'] !== false) throw new Error('p2 should be ineligible after numeric bid');
  },
});

// Case 9: Made Thanni (differential model): balance shifts +4 toward bidding team.
cases.push({
  name: 'Made Thanni: balance shifts +4 toward bidding team (RED)',
  fn: () => {
    let state = createInitialState('p1');
    state = transitionToBiddingPhase1(state);
    const deck = buildDeck();
    const weakHand = byId(deck, ['QH', 'QD', 'QS', 'QC']);
    let patched: GameState = {
      ...state,
      players: new Map(state.players).set('p2', { ...state.players.get('p2')!, hand: weakHand }),
    };
    const r = placeThanniBid(patched.biddingState, 'p2', weakHand);
    patched = { ...patched, biddingState: r.newState! };
    patched = transitionToThanniPlaying(patched);
    const players = new Map(patched.players);
    players.set('p2', { ...players.get('p2')!, tricksWonThisRound: 4 });
    patched = { ...patched, players };
    const result = applyRoundScoring(patched, 'RED', 0);
    assertEq('balanceShift (RED gain)', result.balanceShift, THANNI_WIN_POINTS);
    assertEq('red match-point delta', result.redTeamMatchPointsChange, THANNI_WIN_POINTS);
    assertEq('black match-point delta', result.blackTeamMatchPointsChange, 0);
    assertEq('metBid', result.metBid, true);
  },
});

// Case 10: Failed Thanni (differential model): balance shifts 8 toward opposition.
cases.push({
  name: 'Failed Thanni by RED: balance shifts -8 (BLACK +8, RED stays 0)',
  fn: () => {
    let state = createInitialState('p1');
    state = transitionToBiddingPhase1(state);
    const deck = buildDeck();
    const weakHand = byId(deck, ['QH', 'QD', 'QS', 'QC']);
    let patched: GameState = {
      ...state,
      players: new Map(state.players).set('p2', { ...state.players.get('p2')!, hand: weakHand }),
    };
    const r = placeThanniBid(patched.biddingState, 'p2', weakHand);
    patched = { ...patched, biddingState: r.newState! };
    patched = transitionToThanniPlaying(patched);
    const players = new Map(patched.players);
    players.set('p2', { ...players.get('p2')!, tricksWonThisRound: 2 });
    patched = { ...patched, players };
    const result = applyRoundScoring(patched, 'RED', 0);
    assertEq('balanceShift (BLACK gain)', result.balanceShift, -THANNI_FAIL_PENALTY);
    // balance started at 0, new balance = -8 → red derived = 0 (no change), black derived = 8.
    assertEq('red match-point delta (bidding team at 0)', result.redTeamMatchPointsChange, 0);
    assertEq('black match-point delta (opposition +8)', result.blackTeamMatchPointsChange, THANNI_FAIL_PENALTY);
    assertEq('metBid', result.metBid, false);
  },
});

// Case 11: 3-card trick evaluation (Thanni round) — highest of led suit wins.
cases.push({
  name: 'evaluateTrickWithContext supports 3-card tricks (Thanni)',
  fn: () => {
    const deck = buildDeck();
    const JH = deck.find(c => c.id === 'JH')!;
    const KH = deck.find(c => c.id === 'KH')!;
    const JS = deck.find(c => c.id === 'JS')!; // off-suit slough
    const pile: PlayedCard[] = [
      { card: JH, playerId: 'p2', trickNumber: 1, positionInTrick: 1 },
      { card: KH, playerId: 'p1', trickNumber: 1, positionInTrick: 2 },
      { card: JS, playerId: 'p3', trickNumber: 1, positionInTrick: 3 },
    ];
    const res = evaluateTrickWithContext(pile, null);
    assertEq('trick winner', res.winnerPlayerId, 'p2');
    assertEq('led suit', res.ledSuit, 'HEARTS');
    // Also verify determineTrickWinner (no-trump wrapper) works on 3-card piles.
    const res2 = determineTrickWinner(pile);
    assertEq('determineTrickWinner 3-card winner', res2.winnerPlayerId, 'p2');
  },
});

// Case 12: 3-card trick where an opponent beats the bidder's lead.
cases.push({
  name: '3-card trick: opp J beats bidder 10 of led suit (no trump)',
  fn: () => {
    const deck = buildDeck();
    const tenH = deck.find(c => c.id === '10H')!;
    const JH = deck.find(c => c.id === 'JH')!;
    const QC = deck.find(c => c.id === 'QC')!; // off-suit slough
    const pile: PlayedCard[] = [
      { card: tenH, playerId: 'p2', trickNumber: 1, positionInTrick: 1 },
      { card: JH, playerId: 'p1', trickNumber: 1, positionInTrick: 2 },
      { card: QC, playerId: 'p3', trickNumber: 1, positionInTrick: 3 },
    ];
    const res = evaluateTrickWithContext(pile, null);
    assertEq('trick winner (opp1)', res.winnerPlayerId, 'p1');
  },
});

// ─── Differential (tug-of-war) scenarios ─────────────────────────────────

// Helper: build a patched state with balance + derived points + face-up flags in sync.
function stateWithBalance(base: GameState, balance: number): GameState {
  return {
    ...base,
    balance,
    redTeamScore: { ...base.redTeamScore, points: Math.max(0, balance), isFaceUp: balance > 0 || base.redTeamScore.isFaceUp },
    blackTeamScore: { ...base.blackTeamScore, points: Math.max(0, -balance), isFaceUp: balance < 0 || base.blackTeamScore.isFaceUp },
  };
}

// Case 13: Standard MADE while opp (BLACK) leads by 3 — red gains +1, black drops to 2.
cases.push({
  name: 'Standard made while BLACK leads by 3: red +1, black drops 3 → 2',
  fn: () => {
    let state = createInitialState('p1');
    // Skip the deal/transition plumbing: directly set a numeric bid + balance.
    state = {
      ...state,
      biddingState: {
        ...state.biddingState,
        currentHighestBid: { amount: 150, kind: 'STANDARD', playerId: 'p2', displayName: 'Beat', timestamp: Date.now() },
      },
    };
    state = stateWithBalance(state, -3); // BLACK leads by 3
    // red makes standard bid → +1 toward RED → balance -3 → -2
    const result = applyRoundScoring(state, 'RED', 200 /* actual > bid → met */);
    assertEq('balanceShift', result.balanceShift, 1);
    assertEq('redMatch delta (stays 0)', result.redTeamMatchPointsChange, 0);
    assertEq('blackMatch delta (drops 3→2)', result.blackTeamMatchPointsChange, -1);
    assertEq('metBid', result.metBid, true);
  },
});

// Case 14: Standard FAILED while bidding team (RED) leads by 5 — opp +2 → balance +3.
cases.push({
  name: 'Standard failed while RED leads by 5: balance 5→1, black stays 0',
  fn: () => {
    let state = createInitialState('p1');
    state = {
      ...state,
      biddingState: {
        ...state.biddingState,
        currentHighestBid: { amount: 200, kind: 'STANDARD', playerId: 'p2', displayName: 'John', timestamp: Date.now() },
      },
    };
    state = stateWithBalance(state, 5);
    // red misses John bid (200) → opp gains +4 (high-value)
    const result = applyRoundScoring(state, 'RED', 50 /* actual < bid → failed */);
    assertEq('balanceShift', result.balanceShift, -4);
    assertEq('redMatch delta (drops 5→1)', result.redTeamMatchPointsChange, -4);
    assertEq('blackMatch delta (stays 0)', result.blackTeamMatchPointsChange, 0);
    assertEq('metBid', result.metBid, false);
  },
});

// Case 15: Thanni MADE while opp leads by 3 — red +4 → balance -3 → +1 (red now leads by 1).
cases.push({
  name: 'Thanni made while BLACK leads by 3: red +4 → red leads by 1',
  fn: () => {
    let state = createInitialState('p1');
    state = {
      ...state,
      biddingState: {
        ...state.biddingState,
        currentHighestBid: { amount: 0, kind: 'THANNI', playerId: 'p2', displayName: 'Thanni', timestamp: Date.now() },
      },
      thanniBidderId: 'p2',
    };
    state = stateWithBalance(state, -3);
    const players = new Map(state.players);
    players.set('p2', { ...players.get('p2')!, tricksWonThisRound: 4 });
    state = { ...state, players };
    const result = applyRoundScoring(state, 'RED', 0);
    assertEq('balanceShift', result.balanceShift, THANNI_WIN_POINTS);
    // balance -3 → +1 → red derived 0→1 (change +1), black derived 3→0 (change -3)
    assertEq('redMatch delta (0→1)', result.redTeamMatchPointsChange, 1);
    assertEq('blackMatch delta (3→0)', result.blackTeamMatchPointsChange, -3);
    assertEq('metBid', result.metBid, true);
  },
});

// Case 16: Thanni FAILED while bidding team leads by 5 — opp +8 → balance +5 → -3.
cases.push({
  name: 'Thanni failed while RED leads by 5: balance +5 → -3, black +3',
  fn: () => {
    let state = createInitialState('p1');
    state = {
      ...state,
      biddingState: {
        ...state.biddingState,
        currentHighestBid: { amount: 0, kind: 'THANNI', playerId: 'p2', displayName: 'Thanni', timestamp: Date.now() },
      },
      thanniBidderId: 'p2',
    };
    state = stateWithBalance(state, 5);
    const players = new Map(state.players);
    players.set('p2', { ...players.get('p2')!, tricksWonThisRound: 2 });
    state = { ...state, players };
    const result = applyRoundScoring(state, 'RED', 0);
    assertEq('balanceShift', result.balanceShift, -THANNI_FAIL_PENALTY);
    // balance +5 → -3 → red derived 5→0 (change -5), black derived 0→3 (change +3)
    assertEq('redMatch delta (5→0)', result.redTeamMatchPointsChange, -5);
    assertEq('blackMatch delta (0→3)', result.blackTeamMatchPointsChange, 3);
    assertEq('metBid', result.metBid, false);
  },
});

// Case 17: Tied at 0, Thanni failed by RED → balance 0 → -8.
cases.push({
  name: 'Thanni failed from a 0-0 tie: balance 0 → -8 (black +8)',
  fn: () => {
    let state = createInitialState('p1');
    state = {
      ...state,
      biddingState: {
        ...state.biddingState,
        currentHighestBid: { amount: 0, kind: 'THANNI', playerId: 'p2', displayName: 'Thanni', timestamp: Date.now() },
      },
      thanniBidderId: 'p2',
    };
    state = stateWithBalance(state, 0);
    const players = new Map(state.players);
    players.set('p2', { ...players.get('p2')!, tricksWonThisRound: 1 });
    state = { ...state, players };
    const result = applyRoundScoring(state, 'RED', 0);
    assertEq('balanceShift', result.balanceShift, -THANNI_FAIL_PENALTY);
    assertEq('redMatch delta', result.redTeamMatchPointsChange, 0);
    assertEq('blackMatch delta', result.blackTeamMatchPointsChange, THANNI_FAIL_PENALTY);
  },
});

// Case 18: Match-over via reaching +12 balance (RED wins).
cases.push({
  name: 'Match-over: balance +11 → RED makes standard bid → +12 (RED wins)',
  fn: () => {
    let state = createInitialState('p1');
    state = {
      ...state,
      biddingState: {
        ...state.biddingState,
        currentHighestBid: { amount: 150, kind: 'STANDARD', playerId: 'p2', displayName: 'Beat', timestamp: Date.now() },
      },
    };
    state = stateWithBalance(state, 11);
    const result = applyRoundScoring(state, 'RED', 200);
    assertEq('balanceShift', result.balanceShift, 1);
    assertEq('matchOver', result.matchOver, true);
    assertEq('winner', result.winner, 'RED');
  },
});

// Case 19: Match-over at -12 (BLACK wins).
cases.push({
  name: 'Match-over: balance -11 → BLACK makes standard bid → -12 (BLACK wins)',
  fn: () => {
    let state = createInitialState('p1');
    state = {
      ...state,
      biddingState: {
        ...state.biddingState,
        currentHighestBid: { amount: 150, kind: 'STANDARD', playerId: 'p1', displayName: 'Beat', timestamp: Date.now() },
      },
    };
    state = stateWithBalance(state, -11);
    const result = applyRoundScoring(state, 'BLACK', 200);
    assertEq('balanceShift (BLACK gain)', result.balanceShift, -1);
    assertEq('matchOver', result.matchOver, true);
    assertEq('winner', result.winner, 'BLACK');
  },
});

// ─── Hath Band scenarios ────────────────────────────────────────────────

// Helper: build a GameState that simulates a Hath Band round being called.
// `callerId` calls; the trump card is returned to the bid winner's hand; the
// caller's partner is folded; balance starts at 0.
function buildHathBandState(
  callerId: PlayerId,
  callerTricksWon: number,
  baseBalance = 0,
  trumpCard: Card | null = null,
): GameState {
  let state: GameState = createInitialState('p1');
  // Synthesize a HATH_BAND bid + caller/player state for the scoring path.
  state = {
    ...state,
    biddingState: {
      ...state.biddingState,
      currentHighestBid: { amount: 0, kind: 'HATH_BAND', playerId: callerId, displayName: 'Hath Band', timestamp: Date.now() },
    },
    bidWinnerId: callerId, // simplistic — for testing scoring only.
    balance: baseBalance,
    redTeamScore: { ...state.redTeamScore, points: Math.max(0, baseBalance), isFaceUp: baseBalance > 0 || state.redTeamScore.isFaceUp },
    blackTeamScore: { ...state.blackTeamScore, points: Math.max(0, -baseBalance), isFaceUp: baseBalance < 0 || state.blackTeamScore.isFaceUp },
  };
  // Run the transition: returns trump card to bid winner, voids trump, etc.
  state = transitionToHathBandPlaying(state, callerId, trumpCard);
  // Set the caller's tricksWonThisRound to simulate a Hath Band play outcome.
  const players = new Map(state.players);
  players.set(callerId, { ...players.get(callerId)!, tricksWonThisRound: callerTricksWon });
  state = { ...state, players };
  return state;
}

// Case 20: Made Hath Band by RED → balance shifts +6.
cases.push({
  name: 'Made Hath Band by RED: balance shifts +6 toward RED',
  fn: () => {
    const state = buildHathBandState('p2', HATH_BAND_TRICK_COUNT, 0);
    const result = applyRoundScoring(state, 'RED', 0);
    assertEq('balanceShift (RED gain)', result.balanceShift, HATH_BAND_WIN_POINTS);
    assertEq('redMatch delta', result.redTeamMatchPointsChange, HATH_BAND_WIN_POINTS);
    assertEq('blackMatch delta', result.blackTeamMatchPointsChange, 0);
    assertEq('metBid', result.metBid, true);
  },
});

// Case 21: Failed Hath Band by RED → swing of 12 toward BLACK.
cases.push({
  name: 'Failed Hath Band by RED: balance shifts -12 (BLACK +12, RED stays 0)',
  fn: () => {
    const state = buildHathBandState('p2', 2, 0); // RED took only 2/6 tricks
    const result = applyRoundScoring(state, 'RED', 0);
    assertEq('balanceShift (BLACK gain)', result.balanceShift, -HATH_BAND_FAIL_PENALTY);
    assertEq('redMatch delta', result.redTeamMatchPointsChange, 0);
    assertEq('blackMatch delta', result.blackTeamMatchPointsChange, HATH_BAND_FAIL_PENALTY);
    assertEq('metBid', result.metBid, false);
  },
});

// Case 22: Made Hath Band by BLACK → swing of 6 toward BLACK (opposition steal).
cases.push({
  name: 'Made Hath Band by BLACK caller: balance shifts -6 (BLACK +6)',
  fn: () => {
    const state = buildHathBandState('p1', HATH_BAND_TRICK_COUNT, 0); // BLACK caller
    const result = applyRoundScoring(state, 'RED', 0); // biddingTeam arg is unused for the HATH_BAND branch path
    assertEq('balanceShift (BLACK gain)', result.balanceShift, -HATH_BAND_WIN_POINTS);
    assertEq('redMatch delta', result.redTeamMatchPointsChange, 0);
    assertEq('blackMatch delta', result.blackTeamMatchPointsChange, HATH_BAND_WIN_POINTS);
    assertEq('metBid', result.metBid, true);
  },
});

// Case 23: Failed Hath Band while RED leads by 5 → balance +5 → -7 (BLACK +7).
cases.push({
  name: 'Failed Hath Band while RED leads by 5: balance +5 → -7, BLACK +7',
  fn: () => {
    const state = buildHathBandState('p2', 3, 5); // RED took only 3/6 tricks
    const result = applyRoundScoring(state, 'RED', 0);
    assertEq('balanceShift', result.balanceShift, -HATH_BAND_FAIL_PENALTY);
    // balance +5 → -7 → red derived 5→0 (change -5), black derived 0→7 (change +7)
    assertEq('redMatch delta (5→0)', result.redTeamMatchPointsChange, -5);
    assertEq('blackMatch delta (0→7)', result.blackTeamMatchPointsChange, 7);
    assertEq('metBid', result.metBid, false);
  },
});

// Case 24: Made Hath Band while BLACK leads by 3 (RED caller) → balance -3 → +3 (RED +3, BLACK drops 3).
cases.push({
  name: 'Made Hath Band while BLACK leads by 3: balance -3 → +3',
  fn: () => {
    const state = buildHathBandState('p2', HATH_BAND_TRICK_COUNT, -3);
    const result = applyRoundScoring(state, 'RED', 0);
    assertEq('balanceShift', result.balanceShift, HATH_BAND_WIN_POINTS);
    // balance -3 → +3 → red derived 0→3 (change +3), black derived 3→0 (change -3)
    assertEq('redMatch delta (0→3)', result.redTeamMatchPointsChange, 3);
    assertEq('blackMatch delta (3→0)', result.blackTeamMatchPointsChange, -3);
    assertEq('metBid', result.metBid, true);
  },
});

// Case 25: Hath Band sweep pre-check — guaranteed → disallow.
// Caller holds J, 9, A, K, 10, Q of ♥ (all 6 ♥, top-to-bottom by pointValue in
// their suit). Opponents hold all 18 remaining cards of ♦/♠/♣ — none can follow
// ♥, so caller's ♥ cards win every trick regardless of opp discards.
cases.push({
  name: 'Hath Band sweep check: 6 ♥ cards (J, 9, A, K, 10, Q) → guaranteed sweep → disallow',
  fn: () => {
    const deck = buildDeck();
    const hearts = (['JH', '9H', 'AH', 'KH', '10H', 'QH'] as string[]).map(id => deck.find(c => c.id === id)!);
    // Opponents and the folded partner hold all 18 non-♥ cards collectively.
    const oppsHand = (['p0', 'p1', 'p3']).map((pid, i) =>
      deck.filter(c => !hearts.some(h => h.id === c.id)).slice(i * 6, (i + 1) * 6)
    );
    const allHands = new Map<PlayerId, Card[]>([
      ['p2', hearts],
      ['p0', oppsHand[0]],
      ['p1', oppsHand[1]],
      ['p3', oppsHand[2]],
    ]);
    // No opp has any ♥ → no beater exists for any of the caller's ♥ cards →
    // all 6 caller cards have no potential beater → guaranteed sweep.
    assertEq('isHathBandGuaranteedSweep (6 hearts)', isHathBandGuaranteedSweep('p2', allHands), true);
  },
});

// Case 26: Hath Band sweep pre-check — risk exists → allow.
// Caller holds 6 cards across mixed suits, including a low Q♥ where an opp has J♥ → beater exists.
cases.push({
  name: 'Hath Band sweep check: Q♥ with an opp holding J♥ → risk exists → allow',
  fn: () => {
    const deck = buildDeck();
    // Caller: Q♥, K♠, Q♠, A♦, 10♦, 9♣ (a weak, mixed hand).
    const callerHand = (['QH', 'KS', 'QS', 'AD', '10D', '9C'] as string[]).map(id => deck.find(c => c.id === id)!);
    // p1 holds J♥ (beater for caller's Q♥).
    const p1Hand = (['JH', '9S', 'AS', 'KD', 'KD', 'JC'] as string[]).map(id => deck.find(c => c.id === id)!).filter(Boolean);
    // Deduplicate to avoid collisions — re-pick from the deck.
    const remaining = deck.filter(c => !callerHand.some(h => h.id === c.id));
    const p1HandReal = remaining.filter(c => c.suit === 'HEARTS' && (c.value === 'J' || c.value === 'A' || c.value === 'K')).slice(0, 3);
    const p1HandFiller = remaining.filter(c => !p1HandReal.includes(c)).slice(0, 6 - p1HandReal.length);
    const p1Final = [...p1HandReal, ...p1HandFiller];
    // Distribute the rest to p0 and p3.
    const usedIds = new Set([...callerHand.map(c => c.id), ...p1Final.map(c => c.id)]);
    const rest = deck.filter(c => !usedIds.has(c.id));
    const p0Hand = rest.slice(0, 6);
    const p3Hand = rest.slice(6, 12);
    const allHands = new Map<PlayerId, Card[]>([
      ['p2', callerHand],
      ['p0', p0Hand],
      ['p1', p1Final],
      ['p3', p3Hand],
    ]);
    // Caller's Q♥ has a J♥ (pointValue 30 > 5) → beater exists → risk → allowed.
    assertEq('isHathBandGuaranteedSweep (Q♥ vs J♥)', isHathBandGuaranteedSweep('p2', allHands), false);
  },
});

// Case 27: Match-over via Hath Band make from +6 → +12 (RED wins).
cases.push({
  name: 'Match-over: balance +6 → RED makes Hath Band → +12 (RED wins)',
  fn: () => {
    const state = buildHathBandState('p2', HATH_BAND_TRICK_COUNT, 6);
    const result = applyRoundScoring(state, 'RED', 0);
    assertEq('balanceShift', result.balanceShift, HATH_BAND_WIN_POINTS);
    assertEq('matchOver', result.matchOver, true);
    assertEq('winner', result.winner, 'RED');
  },
});

// Case 28: Match-over via Hath Band miss at -1 → -13 (BLACK wins).
cases.push({
  name: 'Match-over: balance -1 → RED misses Hath Band → -13 (BLACK wins)',
  fn: () => {
    const state = buildHathBandState('p2', 5, -1); // miss — took 5/6 tricks
    const result = applyRoundScoring(state, 'RED', 0);
    assertEq('balanceShift', result.balanceShift, -HATH_BAND_FAIL_PENALTY);
    assertEq('matchOver', result.matchOver, true);
    assertEq('winner', result.winner, 'BLACK');
  },
});

// ─── AI strategy + feature flag scenarios ───────────────────────────────

// Case 29: HeuristicAI.chooseCard returns a legal card.
cases.push({
  name: 'HeuristicAI.chooseCard returns a card from the legal set',
  fn: () => {
    const deck = buildDeck();
    const legal = ['JH', '9H', 'AH', '10H'].map(id => deck.find(c => c.id === id)!);
    const view: CardplayView = {
      myId: 'p1',
      myHand: legal,
      legal,
      trickPile: [],
      trump: null,
      trumpOpen: false,
      partnerId: 'p3',
      isSoloRound: false,
      soloCallerId: null,
      foldedPartnerId: null,
      tricksRemaining: 6,
      fullHands: new Map([['p1', legal]]),
      balance: 0,
      bidWinner: null,
      currentBid: null,
    };
    const ai = new HeuristicAI();
    const pick = ai.chooseCard(view);
    assertEq('pick is legal', legal.some(c => c.id === pick.id), true);
    assertEq('strategy name', ai.name, 'HeuristicAI');
  },
});

// Case 30: HeuristicAI.chooseBid with a strong hand produces a numeric BID.
cases.push({
  name: 'HeuristicAI.chooseBid (strong hand) produces a numeric BID',
  fn: () => {
    const deck = buildDeck();
    // 4 Jacks — extremely strong hand.
    const hand = ['JH', 'JD', 'JS', 'JC'].map(id => deck.find(c => c.id === id)!);
    const view: BiddingView = {
      myId: 'p0',
      myHand: hand,
      currentHighestBid: null,
      minNextBid: 150,
      passesSinceLastBid: 0,
      thanniEligible: true,
      balance: 0,
    };
    const choice = new HeuristicAI().chooseBid(view);
    assertEq('choice.kind', choice.kind, 'BID');
    if (choice.kind !== 'BID') throw new Error('unreachable');
    assertEq('choice.amount >= MIN_BEAT', choice.amount >= 150, true);
    assertEq('choice.amount <= 328', choice.amount <= 328, true);
  },
});

// Case 31: HeuristicAI.chooseBid with a weak hand produces PASS.
cases.push({
  name: 'HeuristicAI.chooseBid (weak hand) produces PASS',
  fn: () => {
    const deck = buildDeck();
    const hand = ['QH', 'QD', 'QS', 'QC'].map(id => deck.find(c => c.id === id)!);
    const view: BiddingView = {
      myId: 'p0',
      myHand: hand,
      currentHighestBid: { amount: 170, kind: 'STANDARD', playerId: 'p1', displayName: '70', timestamp: Date.now() },
      minNextBid: 180,
      passesSinceLastBid: 1,
      thanniEligible: false,
      balance: 0,
    };
    const choice = new HeuristicAI().chooseBid(view);
    assertEq('choice.kind (PASS)', choice.kind, 'PASS');
  },
});

// Case 32: getAIStrategy returns the right strategy per seat-mode.
cases.push({
  name: 'getAIStrategy returns HeuristicAI for legacy/heuristic/mcts, GaAI for ga',
  fn: () => {
    resetAIMode();
    assertEq('isDefaultMode', isDefaultMode(), true);
    const legacy = getAIStrategy('p0');
    assertEq('legacy impl name', legacy.name, 'HeuristicAI');
    setAISeatMode('p0', 'heuristic');
    const heur = getAIStrategy('p0');
    assertEq('heuristic impl name', heur.name, 'HeuristicAI');
    setAISeatMode('p0', 'mcts'); // placeholder still returns HeuristicAI
    const mcts = getAIStrategy('p0');
    assertEq('mcts placeholder name', mcts.name, 'HeuristicAI');
    setAISeatMode('p0', 'ga');
    const ga = getAIStrategy('p0');
    assertEq('ga impl name', ga.name, 'GaAI'); // Now wired up via registry + genome JSON
    resetAIMode();
  },
});

// Case 33: Feature flag default mode + override + reset.
cases.push({
  name: 'Feature flag: default → override → reset cycle works',
  fn: () => {
    resetAIMode();
    assertEq('default p0 mode', getAISeatMode('p0'), 'legacy');
    assertEq('isDefaultMode at start', isDefaultMode(), true);
    setAISeatMode('p0', 'mcts');
    assertEq('p0 after mcts set', getAISeatMode('p0'), 'mcts');
    assertEq('isDefaultMode after override', isDefaultMode(), false);
    resetAIMode();
    assertEq('p0 after reset', getAISeatMode('p0'), 'legacy');
    assertEq('isDefaultMode after reset', isDefaultMode(), true);
  },
});

// Case 34: simulateAction with PLAY advances the trick pile deterministically.
cases.push({
  name: 'simulateAction (PLAY) advances GameState trick pile',
  fn: () => {
    let state = createInitialState('p1');
    state = transitionToBiddingPhase1(state);
    // Force status to PLAYING + set turn to first bidder for the test.
    state = {
      ...state,
      status: 'PLAYING',
      currentTrickNumber: 1,
      currentLeadPlayerId: 'p2',
      trickPile: [],
    };
    const p2Hand = state.players.get('p2')!.hand;
    if (p2Hand.length === 0) throw new Error('p2 hand empty');
    const next = simulateAction(state, { kind: 'PLAY', playerId: 'p2', card: p2Hand[0] });
    assertEq('pile length after play', next.trickPile.length, 1);
    assertEq('played card id', next.trickPile[0].card.id, p2Hand[0].id);
    assertEq('player hand shrunk', next.players.get('p2')!.hand.length, p2Hand.length - 1);
  },
});

// Case 35: simulateAction with PASS increments passesSinceLastBid.
cases.push({
  name: 'simulateAction (PASS) increments passesSinceLastBid',
  fn: () => {
    let state = createInitialState('p1');
    // First bidder is left of dealer (p2).
    const next = simulateAction(state, { kind: 'PASS', playerId: state.biddingState.currentPlayerToBid });
    assertEq('passesSinceLastBid after PASS', next.biddingState.passesSinceLastBid, 1);
    assertEq('thanniEligible for passing player', next.biddingState.thanniEligible['p2'], false);
  },
});

// Case 36: simulateAction ignores illegal actions (returns state unchanged by reference).
cases.push({
  name: 'simulateAction (illegal PLAY) returns input state unchanged',
  fn: () => {
    let state = createInitialState('p1');
    state = transitionToBiddingPhase1(state);
    state = {
      ...state,
      status: 'PLAYING',
      currentTrickNumber: 1,
      currentLeadPlayerId: 'p2',
      trickPile: [],
    };
    // p1 tries to play out of turn (lead is p2). Should be a no-op.
    const p1Hand = state.players.get('p1')!.hand;
    const next = simulateAction(state, { kind: 'PLAY', playerId: 'p1', card: p1Hand[0] });
    assertEq('returned state identity (illegal)', next === state, true);
  },
});

// Case 37: GaAI(DEFAULT_GENOME) reproduces HeuristicAI's bidding decisions byte-for-byte.
// Critical sanity check — the default genome is the starting point for offline training.
cases.push({
  name: 'GaAI(DEFAULT_GENOME) byte-identical to HeuristicAI on bidding for sample hands',
  fn: () => {
    const deck = buildDeck();
    const ga = new GaAI(DEFAULT_GENOME);
    const heur = new HeuristicAI();
    const sampleHands = [
      ['JH', 'JD', 'JS', 'JC'],
      ['QH', 'QD', 'QS', 'QC'],
      ['JH', '9H', 'AH', '10H'],
      ['KH', 'KD', 'KS', '9C'],
      ['JH', '9D', 'AS', '10C'],
    ];
    for (const ids of sampleHands) {
      const hand = ids.map(id => deck.find(c => c.id === id)!).filter(Boolean);
      if (hand.length !== 4) continue;
      // Test as opening bid (no current bid).
      const view: BiddingView = {
        myId: 'p0', myHand: hand, currentHighestBid: null, minNextBid: 150,
        passesSinceLastBid: 0, thanniEligible: true, balance: 0,
      };
      const gaChoice = ga.chooseBid(view);
      const heurChoice = heur.chooseBid(view);
      const gaStr = gaChoice.kind === 'PASS' ? 'PASS' : `BID ${gaChoice.amount}`;
      const heurStr = heurChoice.kind === 'PASS' ? 'PASS' : `BID ${heurChoice.amount}`;
      assertEq(`hand [${ids.join(',')}] opening bid`, gaStr, heurStr);
    }
  },
});

// Run
let pass = 0, fail = 0;
for (const c of cases) {
  console.log(`\n▶ ${c.name}`);
  try { c.fn(); pass++; } catch (e) {
    fail++;
    console.log(`    ✗ ${(e as Error).message}`);
  }
}
console.log(`\n────────────────────────`);
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);