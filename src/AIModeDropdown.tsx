/**
 * AIModeDropdown.tsx — hidden debug dropdown in the header for per-seat
 * AI strategy selection. Persisted via the feature flag's localStorage layer.
 *
 * This is a developer affordance, not a gameplay surface. Rendered as a small
 * text link ("AI Mode") next to the Rules button — discoverable but
 * unobtrusive. Casual users can ignore it; power users can swap strategies
 * for A/B testing.
 */

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  getAIMode, setAISeatMode, resetAIMode,
  type AIModeMap, type AIStrategyName,
} from './ai';

const BOT_NAMES: Record<string, string> = { p0: 'Arjun', p1: 'Vikram', p3: 'Priya' };

export function AIModeDropdown({ onChange }: { onChange?: () => void }): ReactNode {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AIModeMap>(getAIMode());

  // Re-sync local view whenever the dropdown is re-opened so external changes
  // (e.g., console calls to setAISeatMode) are reflected.
  useEffect(() => { if (open) setMode(getAIMode()); }, [open]);

  const seatIds: string[] = ['p0', 'p1', 'p3'];

  const handleSeatChange = (seat: string, name: AIStrategyName) => {
    setAISeatMode(seat, name);
    setMode(getAIMode());
    onChange?.();
  };

  const handleReset = () => {
    resetAIMode();
    setMode(getAIMode());
    onChange?.();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs sm:text-sm text-purple-300 hover:text-purple-200 underline ml-3"
        aria-label="AI mode settings">
        AI Mode
      </button>
      {open && (
        <>
          {/* Backdrop — closes dropdown on tap outside */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Panel: centered overlay on mobile, absolute dropdown on sm+ */}
          <div className="fixed inset-x-3 top-16 z-50 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-72 bg-gray-900 border border-purple-500/40 rounded-lg p-4 sm:p-3 shadow-2xl">
            <div className="text-sm sm:text-xs text-gray-300 mb-3 sm:mb-2 font-bold">Per-seat AI strategy</div>
            {seatIds.map(seat => (
              <div key={seat} className="flex items-center justify-between mb-2 sm:mb-1 gap-2">
                <span className="text-sm sm:text-xs text-gray-300 whitespace-nowrap">{seat} ({BOT_NAMES[seat] ?? seat})</span>
                <select
                  value={mode[seat]}
                  onChange={e => handleSeatChange(seat, e.target.value as AIStrategyName)}
                  className="bg-gray-800 text-sm sm:text-xs text-white rounded px-2 sm:px-1 py-1 sm:py-0.5 border border-gray-700 min-w-0">
                  <option value="legacy">legacy</option>
                  <option value="heuristic">heuristic</option>
                  <option value="mcts">mcts (placeholder)</option>
                  <option value="ga">ga (placeholder)</option>
                </select>
              </div>
            ))}
            <button
              onClick={handleReset}
              className="mt-2 w-full text-sm sm:text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded py-1.5 sm:py-1">
              Reset to default
            </button>
            <div className="text-xs sm:text-[10px] text-gray-500 mt-2 italic leading-relaxed">
              'legacy' bypasses the strategy registry (current behavior). 'heuristic'/'mcts'/'ga' route through getAIStrategy().chooseCard/chooseBid. Thanni & Hath Band decisions always use the heuristic.
            </div>
          </div>
        </>
      )}
    </div>
  );
}