# Game Rules

This page summarizes the implemented Thanni rules at a high level. The detailed, user-facing source of truth is `/RULES.md`, which is also rendered directly in the app.

## Core setup
- Four players form two fixed partnerships: RED vs BLACK.
- The deck has 24 cards: A, K, Q, J, 10, 9 in four suits.
- The round uses a 4-card opening deal, then bidding, trump selection, a 2-card follow-up deal, and six tricks in a normal round.

## Card points
Per suit, the point values are:
- J = 30
- 9 = 20
- A = 11
- 10 = 10
- K = 6
- Q = 5

That yields 82 points per suit and 328 points in play per round.

## Bidding ladder
The game uses the traditional ladder described in `/RULES.md` and `/README.md`:
- Beat at 150
- then 60, 70
- then John, John 10, John 20
- then higher numeric bids up to the deck total

A higher bid always replaces a lower one, and bidding ends when the contract is settled by passes.

## Trump and trick play
- The bid winner selects a trump card face-down.
- The trump suit remains hidden until a player cannot follow suit and requests a reveal.
- Players must follow the led suit when possible.
- The highest card of the led suit wins unless trump is in effect and a trump card is played.

## Match scoring
The game does not track two independent scores. Instead, it uses a single signed balance:
- positive balance means RED leads
- negative balance means BLACK leads

The first side to push the balance to +12 or -12 wins the match.

## Where the rules live in code
- `/thanniEngine.ts` — authoritative game logic and scoring
- `/RULES.md` — human-readable rules and in-app markdown source
- `/scripts/thanni-smoke.ts` — smoke tests that exercise important rule paths
- `/README.md` — short player-facing summary

## When editing rules
- Prefer changing `/thanniEngine.ts` first.
- Update `/RULES.md` to match the engine.
- Check `/scripts/thanni-smoke.ts` for coverage gaps after rule changes.
- If the UI text in `/ThanniGame.tsx` or `/README.md` mentions the changed rule, update that copy too.
