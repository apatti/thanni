/**
 * index.ts — convenience barrel for the per-seat AI strategy module.
 */

export type { AIStrategy, CardplayView, BiddingView, BidChoice } from './AIStrategy';
export { HeuristicAI } from './HeuristicAI';
export { GaAI } from './GaAI';
export type { Genome } from './genome';
export { DEFAULT_GENOME, GENOME_BOUNDS, clampGenome } from './genome';
export { getAIStrategy, setAIStrategy } from './registry';
export {
  type AIStrategyName,
  type AIModeMap,
  getAIMode,
  getAISeatMode,
  setAIMode,
  setAISeatMode,
  resetAIMode,
  isDefaultMode,
  DEFAULT_MODE,
} from './featureFlag';