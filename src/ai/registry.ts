/**
 * registry.ts — per-seat strategy dispatch.
 *
 * `getAIStrategy(seatId)` returns the AIStrategy for the requested seat based
 * on the current feature-flag map (see featureFlag.ts). 'legacy' / 'heuristic'
 * both resolve to HeuristicAI today (identical behavior); 'mcts' and 'ga' are
 * placeholders that will return real impls when those are written.
 *
 * The UI's AI effects check the seat mode FIRST: 'legacy' bypasses the
 * registry entirely (calling aiPickCard and the inline bidding heuristic
 * directly, preserving byte-identical current behavior). Other names route
 * through getAIStrategy().chooseCard / chooseBid.
 */

import type { AIStrategy } from './AIStrategy';
import { HeuristicAI } from './HeuristicAI';
import { getAISeatMode, type AIStrategyName } from './featureFlag';

const impls: Record<AIStrategyName, AIStrategy> = {
  legacy: new HeuristicAI(),
  heuristic: new HeuristicAI(),
  mcts: new HeuristicAI(), // placeholder until MctsAI is written
  ga: new HeuristicAI(),   // placeholder until GaAI is written
};

export function getAIStrategy(seatId: string): AIStrategy {
  const name = getAISeatMode(seatId);
  return impls[name] ?? impls.legacy;
}

/** Programmatic override (e.g., from browser console for ad-hoc A/B testing).
 *  Not used by the UI loop — the per-seat feature flag is the canonical path. */
export function setAIStrategy(_seatId: string, _strategy: AIStrategy): void {
  // Deliberately a no-op for now: the feature-flag map is the canonical path.
  // Future: maintain a parallel override map here if needed.
}