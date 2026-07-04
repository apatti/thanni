/**
 * HeuristicAI.ts — reference AIStrategy impl that wraps the existing
 * `aiPickCard` cardplay heuristic and replicates the bidding heuristic
 * currently inlined in ThanniGame.tsx's AI bidding effect.
 *
 * Behavior is byte-identical to the pre-refactor UI when running in
 * 'legacy' or 'heuristic' mode. Future strategies (MctsAI, GaAI) implement
 * the same interface and can be dropped in via src/ai/registry.ts.
 */

import type { AIStrategy, CardplayView, BiddingView, BidChoice } from './AIStrategy';
import type { Card } from '../../thanniEngine';
import { aiPickCard, evaluateHand } from '../../thanniAI';
import { MAX_BID, MIN_BEAT } from '../../thanniEngine';

export class HeuristicAI implements AIStrategy {
  readonly name = 'HeuristicAI';

  chooseCard(view: CardplayView): Card {
    // 1:1 delegation to the existing heuristic. In a solo round there is no
    // trump and the partner is folded — pass null/false for trump state.
    return aiPickCard(
      view.legal,
      view.trickPile,
      view.myId,
      view.partnerId,
      view.isSoloRound ? false : view.trumpOpen,
      view.isSoloRound ? null : view.trump,
    );
  }

  chooseBid(view: BiddingView): BidChoice {
    // Replicate the existing inline bidding heuristic exactly:
    //   4-card hand eval × 1.5 → projected 6-card strength.
    //   Bid iff the projection meets or exceeds the minimum raise.
    const eval4 = evaluateHand(view.myHand);
    const projectedPoints = Math.round(eval4.adjustedScore * 1.5);
    const minA = view.currentHighestBid ? view.currentHighestBid.amount + 10 : MIN_BEAT;
    if (projectedPoints >= minA && minA <= MAX_BID) {
      const bidAmt = Math.max(minA, Math.ceil(projectedPoints / 10) * 10);
      if (bidAmt <= MAX_BID) return { kind: 'BID', amount: Math.min(bidAmt, MAX_BID) };
    }
    return { kind: 'PASS' };
  }
}