# AI Strategy

This page explains the AI split that now exists in the codebase and matches the current source map. For a file-by-file index of ownership, see [OpenWiki source map](../source-map.md).

Thanni still has a long-standing heuristic AI path, but the newer runtime layer is now a pluggable per-seat strategy system under `/src/ai/`. The important distinction is that the codebase preserves the legacy behavior while allowing experimental seat-by-seat modes.

## What actually runs today
- Human play is still controlled entirely by the UI.
- Non-human seats are driven by AI helpers for bidding and card play.
- The `legacy` mode bypasses the strategy registry and calls the older heuristic flow directly, preserving pre-refactor behavior.
- The `heuristic` mode routes through the strategy interface but delegates to the same heuristic logic, so it behaves the same as `legacy` today.
- The `mcts` mode is still a placeholder in the registry and currently resolves to the heuristic implementation.
- The `ga` mode loads a genome-backed strategy from `/src/ai/ga-genome.json`.

## Engine and coverage touchpoints
AI changes usually need engine and smoke-script updates together because the decision code depends on the same public rule surface.
- `/thanniEngine.ts` owns the legal-move, bidding, trick, solo-call, and scoring rules that AI code reads.
- `/scripts/thanni-smoke.ts` exercises the decision helpers and is the best place to pin behavior when the AI surface changes.
- If you change the shape of the decision views in `/src/ai/AIStrategy.ts`, expect to update both the heuristic and GA implementations.
- If you add new seat modes or change the registry behavior, update `/src/ai/featureFlag.ts` and `/src/ai/registry.ts` together.

## Canonical files
- `/thanniAI.ts` — legacy heuristic helpers, including card selection, bid evaluation, Thanni/Hath Band helpers, and utility logic used by newer strategies.
- `/src/ai/AIStrategy.ts` — pure decision interface and read-only views passed into strategy implementations.
- `/src/ai/HeuristicAI.ts` — reference strategy that wraps the existing heuristic behavior.
- `/src/ai/GaAI.ts` — genome-parameterized strategy implementation.
- `/src/ai/genome.ts` — genome shape, defaults, bounds, and clamping.
- `/src/ai/featureFlag.ts` — per-seat mode storage in localStorage.
- `/src/ai/registry.ts` — maps seat mode names to concrete implementations.
- `/src/ai/index.ts` — barrel export for the AI module.
- `/src/AIModeDropdown.tsx` — hidden debug control for selecting a mode per seat.
- `/scripts/ga-train.ts` — offline trainer that evolves and writes the genome artifact.

## Boundary between legacy heuristics and pluggable strategies
The strategy interface currently covers only:
- choosing a card
- choosing a numeric bid or pass

It does not own Thanni or Hath Band calls. Those still short-circuit in the older heuristic flow before the strategy is consulted.

That boundary matters for future work. If you want solo-call logic to become swappable, you would need to expand the interface and update the UI effects that currently handle those decisions separately.

## How the per-seat mode system works
`/src/ai/featureFlag.ts` stores a strategy name per player seat in localStorage. The valid names are `legacy`, `heuristic`, `mcts`, and `ga`, with `legacy` as the default for every seat.

`/src/ai/registry.ts` then resolves the current mode to an implementation. Today the registry wires `legacy`, `heuristic`, and `mcts` to the heuristic strategy, while `ga` uses the loaded genome artifact.

This keeps the runtime stable while still letting you compare implementations seat-by-seat.

## Why the split exists
The split gives the repository a safe experimentation path:
- preserve the current game experience for existing players
- swap strategies on a per-seat basis for testing
- evolve the genome offline and ship the resulting artifact into the runtime
- keep the strategy interface pure so decision logic is easier to test and reason about

## Practical guidance for future changes
- Preserve the legacy path unless you are intentionally changing current gameplay.
- If you add a new strategy name, update `featureFlag.ts`, `registry.ts`, and any UI controls together.
- If you change the decision-view shape in `AIStrategy.ts`, audit both `HeuristicAI` and `GaAI`.
- If you change the genome workflow, verify both `/src/ai/GaAI.ts` and `/scripts/ga-train.ts`.
- If you change special-call behavior, inspect `/thanniAI.ts` and the UI flow that short-circuits those calls.

## Related docs
- [Quickstart](../quickstart.md)
- [Source map](../source-map.md)
- [Architecture overview](../architecture.md)
