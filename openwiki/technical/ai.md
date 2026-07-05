# AI Strategy

Thanni currently has two AI layers:
1. the original heuristic helpers in `/thanniAI.ts`
2. a newer per-seat strategy abstraction in `/src/ai/`

The codebase uses the heuristic path as the stable baseline while introducing more modular strategy selection for experimentation.

## Current behavior
- Human play is always controlled by the UI.
- Non-human seats use AI helpers to bid and play cards.
- The `legacy` seat mode bypasses the strategy registry and uses the older heuristic path directly.
- The `heuristic` mode routes through the strategy interface but behaves the same as legacy today.
- `mcts` is currently a placeholder that resolves to the heuristic implementation.
- `ga` uses a genome-backed implementation loaded from `/src/ai/ga-genome.json`.

## Key files
- `/thanniAI.ts` — existing heuristic logic for card play and special bid/call decisions.
- `/src/ai/AIStrategy.ts` — strategy interface and read-only decision views.
- `/src/ai/HeuristicAI.ts` — strategy wrapper around the baseline heuristic behavior.
- `/src/ai/GaAI.ts` — genome-driven strategy implementation.
- `/src/ai/genome.ts` — genome shape and default weights.
- `/src/ai/featureFlag.ts` — per-seat mode storage in localStorage.
- `/src/ai/registry.ts` — maps seat mode to implementation.
- `/src/AIModeDropdown.tsx` — hidden debug control for selecting a mode per seat.
- `/scripts/ga-train.ts` — offline trainer for evolving the genome.

## Decision boundaries
The strategy interface only covers:
- choose a card
- choose a numeric bid or pass

It does not currently own Thanni or Hath Band call decisions. Those remain in the older heuristic flow and short-circuit before the strategy is consulted.

That boundary matters if you want to make the solo calls pluggable later. You would need to expand the interface and update the UI effect that currently handles those calls separately.

## Why the strategy split exists
The repository recently added a modular AI system so new strategies can be tested seat-by-seat without deleting the old behavior. That makes it possible to compare heuristics and newer approaches while keeping the live game stable.

The strategy split also makes the genome workflow easier: the GA trainer can evolve parameters offline and then write the trained genome into the repo for the runtime strategy to consume.

## Practical guidance for future changes
- Preserve the legacy path unless you are deliberately changing current gameplay behavior.
- Update the registry and feature-flag types together if you add a new strategy name.
- If you add a new training or evaluation script, make sure it uses the same engine primitives as the runtime AI.
- If you change the shape of the decision view, audit both heuristic and genome-backed implementations.

## High-signal source references
- `/thanniAI.ts`
- `/src/ai/AIStrategy.ts`
- `/src/ai/registry.ts`
- `/src/ai/featureFlag.ts`
- `/src/ai/GaAI.ts`
- `/scripts/ga-train.ts`
- `/AITodo.md`
