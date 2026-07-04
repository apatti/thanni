/**
 * genome.ts — tunable parameter vector for GaAI.
 *
 * The genome is a small object of scalar weights that parameterize the
 * cardplay + bidding heuristics inside GaAI. The default values match
 * HeuristicAI's current hardcoded numbers exactly, so `GaAI(DEFAULT_GENOME)`
 * reproduces the heuristic's behavior byte-for-byte — a useful sanity check
 * and the starting point for offline GA evolution.
 *
 * Genes are bounded; the trainer clamps mutations to these ranges:
 *   - bid bonuses/projection: positive reals (no upper bound, but practically <50)
 *   - confidenceThreshold:    >= 0.5 (lower = more aggressive bidding)
 *   - cardplay scalars:        0..1 (they're lerped / thresholded inside GaAI)
 *
 * Evolving the genome via `scripts/ga-train.ts` learns better-tuned values
 * for these weights; the artifact is serialized to `src/ai/ga-genome.json`.
 */

export interface Genome {
  // ── Bidding weights ──────────────────────────────────────────────
  /** Bonus added to hand eval when the longest suit has ≥4 cards. Default 15. */
  concentrationBonus4: number;
  /** Bonus when the longest suit has ≥3 cards. Default 8. */
  concentrationBonus3: number;
  /** Bonus when the hand has ≥4 A/K/Q cards. Default 10. */
  highCardBonus4: number;
  /** Bonus when the hand has ≥3 A/K/Q cards. Default 5. */
  highCardBonus3: number;
  /** Multiplier on adjusted 4-card score to project to 6-card strength. Default 1.5. */
  projectionFactor: number;
  /** Multiplier on the minimum raise required to bid (1.0 = no override, <1.0 = bids more eagerly). Default 1.0. */
  confidenceThreshold: number;

  // ── Cardplay weights ──────────────────────────────────────────────
  /** Lead policy: 1.0 = lead highest non-trump (default), 0.0 = lead lowest. */
  leadHighest: number;
  /** Partner-winning dump policy: 1.0 = dump cheapest (default), 0.0 = dump highest. */
  partnerWinningDumpCheapest: number;
  /** Opponent-winning beat policy: 1.0 = cheapest beater (default), 0.0 = strongest beater. */
  oppWinningBeatPolicy: number;
  /** Opponent-winning no-beater dump policy: 1.0 = dump cheapest (default), 0.0 = dump highest. */
  oppWinningDumpPolicy: number;
}

export const DEFAULT_GENOME: Genome = {
  concentrationBonus4: 15,
  concentrationBonus3: 8,
  highCardBonus4: 10,
  highCardBonus3: 5,
  projectionFactor: 1.5,
  confidenceThreshold: 1.0,
  leadHighest: 1.0,
  partnerWinningDumpCheapest: 1.0,
  oppWinningBeatPolicy: 1.0,
  oppWinningDumpPolicy: 1.0,
};

/** Bounds for each gene — used by the trainer to clamp mutations. */
export const GENOME_BOUNDS: Record<keyof Genome, [number, number]> = {
  concentrationBonus4: [0, 50],
  concentrationBonus3: [0, 30],
  highCardBonus4: [0, 30],
  highCardBonus3: [0, 20],
  projectionFactor: [0.5, 2.5],
  confidenceThreshold: [0.5, 1.5],
  leadHighest: [0, 1],
  partnerWinningDumpCheapest: [0, 1],
  oppWinningBeatPolicy: [0, 1],
  oppWinningDumpPolicy: [0, 1],
};

/** Sanity check: throw if any gene is out of bounds. Useful in GaAI's ctor. */
export function clampGenome(g: Genome): Genome {
  const out: Genome = { ...DEFAULT_GENOME };
  for (const k of Object.keys(DEFAULT_GENOME) as (keyof Genome)[]) {
    const [lo, hi] = GENOME_BOUNDS[k];
    out[k] = Math.max(lo, Math.min(hi, g[k] ?? DEFAULT_GENOME[k]));
  }
  return out;
}