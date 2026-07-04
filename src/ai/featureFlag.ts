/**
 * featureFlag.ts — per-seat AI strategy name registry with localStorage
 * persistence.
 *
 * Values:
 *   'legacy'    — bypass the strategy registry; UI calls aiPickCard and the
 *                 inline bidding heuristic directly (current pre-refactor
 *                 behavior). Zero indirection cost.
 *   'heuristic' — route through getAIStrategy().chooseCard / chooseBid with
 *                 the HeuristicAI reference impl. Byte-identical to 'legacy'
 *                 today; the indirection is paid for the option to swap later.
 *   'mcts'      — placeholder until MctsAI is written (currently falls back
 *                 to HeuristicAI inside the registry).
 *   'ga'        — placeholder until GaAI is written (same fallback).
 *
 * Default: every seat is 'legacy'. Persisted to localStorage so a power
 * user's A/B test settings survive reloads. Editable via the hidden debug
 * dropdown in the header (src/AIModeDropdown.tsx).
 */

import type { PlayerId } from '../../thanniEngine';

export type AIStrategyName = 'legacy' | 'heuristic' | 'mcts' | 'ga';

export type AIModeMap = Record<PlayerId, AIStrategyName>;

const STORAGE_KEY = 'thanni_ai_mode';
export const DEFAULT_MODE: AIModeMap = { p0: 'legacy', p1: 'legacy', p2: 'legacy', p3: 'legacy' };

function isValidName(v: unknown): v is AIStrategyName {
  return v === 'legacy' || v === 'heuristic' || v === 'mcts' || v === 'ga';
}

function load(): AIModeMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MODE };
    const parsed = JSON.parse(raw);
    const out: AIModeMap = { ...DEFAULT_MODE };
    for (const k of ['p0', 'p1', 'p2', 'p3'] as PlayerId[]) {
      if (isValidName(parsed[k])) out[k] = parsed[k];
    }
    return out;
  } catch {
    return { ...DEFAULT_MODE };
  }
}

let currentMode: AIModeMap = load();

export function getAIMode(): AIModeMap { return { ...currentMode }; }
export function getAISeatMode(seatId: PlayerId): AIStrategyName { return currentMode[seatId] ?? 'legacy'; }
export function setAIMode(newMode: AIModeMap): void {
  currentMode = { ...DEFAULT_MODE, ...newMode };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentMode)); } catch { /* ignore */ }
}
export function setAISeatMode(seatId: PlayerId, name: AIStrategyName): void {
  setAIMode({ ...currentMode, [seatId]: name });
}
export function resetAIMode(): void {
  setAIMode({ ...DEFAULT_MODE });
}
export function isDefaultMode(): boolean {
  return (['p0', 'p1', 'p2', 'p3'] as PlayerId[]).every(k => currentMode[k] === DEFAULT_MODE[k]);
}