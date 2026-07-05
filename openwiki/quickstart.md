# OpenWiki Quickstart

Thanni is a client-side React card game that adapts a traditional Indian 24-card bidding and trick-taking game for the browser. The app lets one human player compete with three AI seats, includes special solo calls like Thanni and Hath Band, and runs entirely without a backend or database.

Start here if you are new to the repo. This page links to the key docs a future contributor or coding agent needs before changing gameplay, AI, UI, or deployment.

## What this repository is
- A Vite + React + TypeScript web app (`/package.json`, `/src/main.tsx`).
- Main UI in `/ThanniGame.tsx`.
- Rule and state engine in `/thanniEngine.ts`.
- AI heuristics and pluggable strategy layer in `/thanniAI.ts` and `/src/ai/`.
- In-browser sound effects in `/src/sounds.ts`.
- GitHub Pages deployment via `/.github/workflows/deploy.yml`.

## What the product does
- Simulates the 24-card game with the traditional bid ladder: Beat, 60, 70, John, John 10, John 20, and higher numeric bids.
- Supports the special solo actions **Thanni** and **Hath Band**.
- Uses hidden trump until revealed by the rules.
- Tracks match progress with a tug-of-war style balance that ends at ±12.
- Is designed for offline, responsive play from mobile to desktop.

## Where to go next
- [Architecture overview](architecture.md)
- [Game rules](gameplay/rules.md)
- [Special mechanics](gameplay/special-mechanics.md)
- [AI strategy](technical/ai.md)
- [Operations and verification](operations.md)

## Best starting files in source
- `/README.md` — user-facing summary and project structure.
- `/RULES.md` — canonical rules used by the in-app rules modal.
- `/ThanniGame.tsx` — main React UI, seat setup, modal flow, responsive layout.
- `/thanniEngine.ts` — authoritative game logic and scoring rules.
- `/thanniAI.ts` — current heuristic AI and special-call helpers.
- `/src/ai/AIStrategy.ts` — strategy interface and decision views.
- `/src/ai/registry.ts` — per-seat strategy selection.
- `/scripts/thanni-smoke.ts` — smoke test coverage for core rules.

## Repository map

| Area | Key files | Why it matters |
|---|---|---|
| Game UI | `/ThanniGame.tsx`, `/src/Markdown.tsx`, `/src/sounds.ts` | Owns the visible game flow, rules modal, audio cues, and responsive card layout. |
| Game engine | `/thanniEngine.ts` | Owns deck construction, legal moves, bidding, trump logic, trick resolution, and scoring. |
| AI | `/thanniAI.ts`, `/src/ai/` | Owns heuristic play, per-seat strategy selection, and GA scaffolding. |
| Documentation | `/README.md`, `/RULES.md`, `/PRD-Indian-24Card-Bidding-Game.md` | Describes the product intent and rules; useful for cross-checking behavior. |
| Verification | `/scripts/thanni-smoke.ts` | Exercises key rule paths and strategy helpers. |
| Build/deploy | `/package.json`, `/.github/workflows/deploy.yml` | Defines local scripts and GitHub Pages publishing. |

## Change guidance
- If you change gameplay, start in `/thanniEngine.ts`, then update `/RULES.md` and the relevant UI copy in `/ThanniGame.tsx`.
- If you change AI behavior, inspect both `/thanniAI.ts` and `/src/ai/`; the codebase now has a legacy heuristic path and a pluggable strategy path.
- If you change mobile layout or visual feedback, `/ThanniGame.tsx` and `/src/sounds.ts` are the main touchpoints.
- Before shipping changes, run the build and the smoke script described in [Operations](operations.md).
