# Source Map

This page is the fastest way to find the code that owns a behavior. It complements the overview pages by mapping major runtime and support files to their responsibilities.

## App entry and UI

- `/src/main.tsx` — Vite/React bootstrap; mounts `<ThanniGame />` into `#root`.
- `/ThanniGame.tsx` — main game component, screen flow, table UI, action handlers, debug controls, and the in-app rules modal wiring.
- `/src/Markdown.tsx` — lightweight markdown renderer used for the rules modal; intentionally small and dependency-free.
- `/src/AIModeDropdown.tsx` — hidden developer dropdown for per-seat AI strategy selection.
- `/src/sounds.ts` — synthesized audio cues and mute persistence.
- `/src/index.css` — global styles loaded by the app entrypoint.

## Game rules and state engine

- `/thanniEngine.ts` — canonical rules implementation and state machine.
  - Deck construction, card ordering, trick logic, scoring, and round transitions live here.
  - Match constants such as `MATCH_GOAL`, `MIN_BEAT`, `THANNI_WIN_POINTS`, and `HATH_BAND_WIN_POINTS` are defined here.
- `/RULES.md` — user-facing canonical rules text rendered in the app via `/ThanniGame.tsx`.
- `/scripts/thanni-smoke.ts` — smoke coverage for rule transitions, Thanni, Hath Band, and strategy helpers.
- `/PRD-Indian-24Card-Bidding-Game.md` — original product requirements and historical behavior reference.

## Legacy heuristic AI

- `/thanniAI.ts` — long-standing heuristic AI helpers.
  - Contains hand evaluation, bid suggestion, card selection, Thanni/Hath Band heuristics, and dealer-rotation helpers.
  - `HeuristicAI` in `/src/ai/HeuristicAI.ts` delegates back to the same logic so the refactor preserves current behavior.

## Pluggable per-seat AI

- `/src/ai/AIStrategy.ts` — strategy interface plus the read-only decision views passed into strategies.
- `/src/ai/featureFlag.ts` — per-seat strategy registry with localStorage persistence.
- `/src/ai/registry.ts` — dispatches the concrete strategy for a seat; today `legacy` and `heuristic` resolve to the heuristic implementation, while `ga` loads a genome-backed strategy.
- `/src/ai/HeuristicAI.ts` — reference strategy implementation that mirrors the legacy heuristics.
- `/src/ai/GaAI.ts` — genome-parameterized strategy with tunable bidding and cardplay thresholds.
- `/src/ai/genome.ts` — genome shape, defaults, bounds, and clamping logic.
- `/src/ai/index.ts` — barrel export used by UI and scripts.
- `/src/ai/ga-genome.json` — trained artifact consumed by `GaAI` at runtime; by default it matches the heuristic genome.
- `/scripts/ga-train.ts` — offline training script that evolves and writes the genome artifact.

## Build, deployment, and support files

- `/package.json` — dev/build/preview scripts and dependency list.
- `/vite.config.ts` — Vite configuration.
- `/index.html` — static HTML shell used by Vite.
- `/.github/workflows/deploy.yml` — GitHub Pages build-and-deploy workflow.
- `/README.md` — end-user summary, live project URL, and project structure overview.

## Change-oriented guidance

- If you change rules, start in `/thanniEngine.ts`, then update `/RULES.md`, `/ThanniGame.tsx`, and the smoke script if needed.
- If you change AI behavior, check both the legacy path in `/thanniAI.ts` and the strategy layer under `/src/ai/`.
- If you change the rules modal copy or markdown rendering, inspect `/RULES.md` and `/src/Markdown.tsx` together.
- If you change deployment or build behavior, check `/package.json` and `/.github/workflows/deploy.yml`.

## Related docs

- [Quickstart](quickstart.md)
- [Architecture overview](architecture.md)
- [Operations](operations.md)
- [Gameplay rules](gameplay/rules.md)
- [Special mechanics](gameplay/special-mechanics.md)
- [AI strategy](technical/ai.md)
