# Architecture Overview

Thanni is a single-page browser game. The repository is intentionally small in runtime surface area: the UI renders everything, the local engine enforces the rules, and the AI logic decides what non-human seats do. There is no server component in the current implementation.

## Runtime layers

### 1) App bootstrap
- `/src/main.tsx` mounts `<ThanniGame />` into `#root`.
- Vite provides the dev server and production build.

### 2) Main UI
- `/ThanniGame.tsx` is the central React component and owns the actual player experience.
- It renders the lobby, table, bidding, trick play, rules modal, audio controls, and debug AI controls.
- The file imports rules text from `/RULES.md?raw`, so the in-app rules modal and the markdown file stay aligned.

### 3) Game engine
- `/thanniEngine.ts` is the canonical rules layer.
- It defines the card model, deck generation, legal-card filtering, bidding state, trick evaluation, hidden trump behavior, solo-round helpers, scoring, and match end conditions.
- This is the safest place to make gameplay changes because the rest of the app is built around it.

### 4) AI decision-making
- `/thanniAI.ts` holds the long-standing heuristic AI helpers used by the game.
- `/src/ai/AIStrategy.ts` defines the pluggable strategy interface used by the newer per-seat AI system.
- `/src/ai/registry.ts` chooses a concrete strategy per seat based on the feature-flag map in `/src/ai/featureFlag.ts`.
- `/src/ai/GaAI.ts` and `/scripts/ga-train.ts` support a genome-driven strategy workflow.

### 5) UX feedback
- `/src/sounds.ts` provides synthesized audio cues using the Web Audio API.
- The sounds are generated in code, so the repo does not depend on external asset files.

### 6) Build and deployment
- `/package.json` defines `dev`, `build`, and `preview` scripts.
- `/.github/workflows/deploy.yml` builds on pushes to `main` and publishes the Vite output to GitHub Pages.

## Why the split exists
The game logic has several rule-heavy branches: bidding, special solo calls, hidden trump, forced follow-suit behavior, and the tug-of-war scoring model. Keeping that logic in the engine makes the UI easier to reason about and gives the AI a stable surface to inspect.

The AI code is split between the original heuristic helpers and the newer strategy interface so the team can compare behaviors without rewriting the game loop. The `legacy` mode bypasses the strategy registry entirely, which preserves current behavior for seats that do not opt into the new system.

## What to watch out for when changing architecture
- Do not duplicate rule changes only in the UI; update the engine first.
- The rules text in `/RULES.md` is rendered into the app, so changes there affect users immediately.
- Some recent features are UI-facing only, such as the responsive/mobile work and sound cues; these are tracked in `ThanniGame.tsx` and `src/sounds.ts`, not in the engine.
- The AI registry currently falls back to the heuristic implementation for placeholder modes. If you add a real strategy, wire it in both the registry and any related training or testing scripts.

## High-signal source references
- `/ThanniGame.tsx`
- `/thanniEngine.ts`
- `/thanniAI.ts`
- `/src/ai/AIStrategy.ts`
- `/src/ai/featureFlag.ts`
- `/src/ai/registry.ts`
- `/src/sounds.ts`
- `/.github/workflows/deploy.yml`
