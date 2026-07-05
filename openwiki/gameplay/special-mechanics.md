# Special Mechanics

Thanni has several mechanics that make it more than a standard trick-taking game. These are the parts most likely to confuse a new contributor, so they deserve their own note.

## Thanni
Thanni is the high-risk solo bid:
- It can only be made as a player's first action in the bidding phase.
- It ends bidding immediately.
- The phase-2 deal and trump selection are skipped.
- The bidder's partner folds.
- The bidder plays alone and must win all four tricks.
- If the bid succeeds, the balance swings by +4 toward the bidder's team; if it fails, the opponent gains +8.

The validation and state transitions for this flow are implemented in `/thanniEngine.ts`, and the smoke coverage for it lives in `/scripts/thanni-smoke.ts`.

## Hath Band
Hath Band is the post-bid all-tricks call:
- It happens after the full round deal and trump selection, but before the first trick.
- The caller's partner folds.
- The caller must win all six tricks.
- The chosen trump is discarded for the round.
- The score swing is +6 on success and +12 against the caller on failure.
- Either team can call it, including a stolen contract from the opposition.

This mechanic was added later than the basic game loop, which is why it appears prominently in the recent git history and in the smoke test script.

## Trump reveal
The trump card is hidden face-down until a player cannot follow suit and requests a reveal.
Important implementation details:
- the reveal makes the trump suit public for the rest of the round
- the requester must play trump if they have one after the reveal
- there is no trump in solo rounds, so the mechanic does not apply there

## Eligibility and guarantee checks
The engine includes safety checks that prevent certain solo calls when the caller's cards make the result mathematically guaranteed.
These checks are useful because they stop degenerate or non-risky calls. The smoke script contains explicit scenarios that verify both allowed and disallowed cases.

## Why these mechanics matter to future work
If you touch bidding or trick resolution, you should check all three of these areas together:
1. solo-call eligibility
2. trick winner resolution
3. scoring deltas and fold behavior

A local change that only updates the UI can easily diverge from the rules engine here.
