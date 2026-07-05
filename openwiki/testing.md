# Testing and Coverage

This repo does not currently ship a full automated test suite such as Vitest or React Testing Library. The main executable verification artifact is `/scripts/thanni-smoke.ts`, which is a TypeScript smoke script rather than a test runner in the package scripts.

## What exists today
- `/package.json` only defines `dev`, `build`, and `preview` scripts.
- `npm run build` runs TypeScript checking followed by the Vite production build.
- `/scripts/thanni-smoke.ts` is the repository's main rule/AI verification script.
- `/PRD-Indian-24Card-Bidding-Game.md` still references a more ambitious Vitest-based testing setup, but that is not reflected in the current package scripts.

## What the smoke script covers
The smoke script exercises several important code paths:
- guaranteed sweep checks for positive and negative hand shapes
- Thanni validation and state transitions
- Hath Band validation and state transitions
- trick evaluation and winner resolution helpers
- round scoring helpers
- AI strategy plumbing, including heuristic and GA-backed strategy access

Because the script imports both `/thanniEngine.ts` and `/src/ai/`, it gives broad coverage of the rule engine and the current strategy surface without requiring a browser environment.

## Engine coverage notes
The engine is the safest place to add coverage when gameplay changes.
Focus on these areas:
- deck construction and card ordering
- legal action checks during bidding
- trick winner resolution and trump handling
- solo-call eligibility for Thanni and Hath Band
- scoring deltas and match-end balance changes

When adding or changing engine logic, the smoke script is usually the first place to extend. If a change is hard to express there, add a smaller targeted script or a proper test harness before shipping the behavior.

## Coverage gaps worth knowing about
The current repo has a few notable gaps:
- no dedicated unit test runner is wired into `package.json`
- no browser component tests are committed
- the smoke script is manually run, so it is easy for coverage to drift unless contributors keep it updated
- the current script checks behavior with representative scenarios, not exhaustive state-space coverage

## Practical guidance for future changes
- If you change the engine, update `/scripts/thanni-smoke.ts` with at least one positive and one negative case for the changed rule.
- If you change AI behavior, add assertions in the smoke script around the decision surface you touched.
- If you introduce a real test runner, document the new command in `/package.json`, then update `/openwiki/operations.md` and this page together.
- If you rely on the PRD's historical Vitest references, treat them as planning history rather than current implementation.

## Related docs
- [Quickstart](quickstart.md)
- [Operations](operations.md)
- [Game rules](gameplay/rules.md)
- [Special mechanics](gameplay/special-mechanics.md)
- [AI strategy](technical/ai.md)