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
  applyRoundScoring,
  evaluateTrickWithContext,
  determineTrickWinner,
  THANNI_WIN_POINTS,
  THANNI_FAIL_PENALTY,
  type Card,
  type GameState,
  type PlayedCard,
} from '../thanniEngine';

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

// Case 9: applyRoundScoring for a made Thanni → bidding team +4 (or banked if face-down).
cases.push({
  name: 'applyRoundScoring for a made Thanni bid awards +4 to bidding team',
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
    // Bidding team (RED) face-up so the +4 actually pays out into match points.
    patched = { ...patched, redTeamScore: { ...patched.redTeamScore, isFaceUp: true } };
    const players = new Map(patched.players);
    players.set('p2', { ...players.get('p2')!, tricksWonThisRound: 4 });
    patched = { ...patched, players };
    const result = applyRoundScoring(patched, 'RED', 0);
    assertEq('red match-point delta', result.redTeamMatchPointsChange, THANNI_WIN_POINTS);
    assertEq('black match-point delta', result.blackTeamMatchPointsChange, 0);
    assertEq('metBid', result.metBid, true);
  },
});

// Case 10: applyRoundScoring for a failed Thanni → opp +8 AND bidding team −8.
cases.push({
  name: 'applyRoundScoring for a failed Thanni bid: opp +8 and bidding team −8',
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
    // Make opposition face-up so the +8 shows as black match-point change.
    patched = { ...patched, blackTeamScore: { ...patched.blackTeamScore, isFaceUp: true } };
    // Bidder only won 2 tricks → missed Thanni.
    const players = new Map(patched.players);
    players.set('p2', { ...players.get('p2')!, tricksWonThisRound: 2 });
    patched = { ...patched, players };
    const result = applyRoundScoring(patched, 'RED', 0);
    assertEq('red match-point delta (bidding team penalty)', result.redTeamMatchPointsChange, -THANNI_FAIL_PENALTY);
    assertEq('black match-point delta (opposition reward)', result.blackTeamMatchPointsChange, THANNI_FAIL_PENALTY);
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