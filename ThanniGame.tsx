/**
 * ThanniGame.tsx — Complete React UI for the 24-Card Indian Card Game
 * @version 4.0.0 — Lobby screen, Rules modal, Card-pick for first dealer
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  Bid, PlayedCard, Card, Suit, TrickResult,
  SUIT_SYMBOLS,
  buildDeck, shuffleDeck, getBidDisplayName,
  evaluateTrickWithContext, sortCards, getLegalCards,
  MATCH_GOAL, MIN_BEAT, MAX_BID,
  getNextPlayerClockwise,
  isGuaranteedSweep,
  isHathBandGuaranteedSweep,
  THANNI_BID_AMOUNT, THANNI_WIN_POINTS, THANNI_FAIL_PENALTY,
  HATH_BAND_BID_AMOUNT, HATH_BAND_WIN_POINTS, HATH_BAND_FAIL_PENALTY, HATH_BAND_TRICK_COUNT,
} from './thanniEngine';
import { evaluateHand, aiPickCard, computeNextDealer, aiShouldBidThanni, aiShouldCallHathBand } from './thanniAI';
import { Markdown } from './src/Markdown';
import rulesMarkdown from './RULES.md?raw';
import {
  getAIStrategy, getAISeatMode, getAIMode, isDefaultMode,
  type CardplayView, type BiddingView,
} from './src/ai';
import { AIModeDropdown } from './src/AIModeDropdown';
import { initAudio, playSound, isMuted, toggleMute } from './src/sounds';
import { QuickStartGuide } from './src/QuickStartGuide';

// ─── Types ────────────────────────────────────────────────────────────
type GameStatus =
  | 'LOBBY' | 'BIDDING_PHASE1' | 'BIDDING_PHASE2'
  | 'TRUMP_SET' | 'PLAYING' | 'TRUMP_REVEALED' | 'THANNI_PLAYING' | 'HATH_BAND_PLAYING'
  | 'ROUND_SCORED' | 'MATCH_OVER';

type Team = 'RED' | 'BLACK';

interface PlayerState {
  id: string; name: string; team: Team; partnerId: string;
  hand: Card[]; isHuman: boolean;
  tricksWon: number; pointsCaptured: number;
}

// PRD: RED = p0+p2, BLACK = p1+p3
const mkPlayer = (id: string, name: string, team: Team, partnerId: string, isHuman = false): PlayerState =>
  ({ id, name, team, partnerId, hand: [], isHuman, tricksWon: 0, pointsCaptured: 0 });

const PID = 'p2';
const BOT_NAMES: Record<string, string> = { p0: 'Arjun', p1: 'Vikram', p3: 'Priya' };

// Debug helpers — format cards / hands for the debug log panel.
const fmtCard = (c: Card): string => `${c.value}${SUIT_SYMBOLS[c.suit]}`;
const fmtHand = (cs: Card[]): string => cs.length ? cs.map(fmtCard).join(' ') : '∅';
const fmtPile = (pile: PlayedCard[]): string => pile.length
  ? pile.map(pc => `${pc.playerId}:${fmtCard(pc.card)}`).join(' ')
  : '∅';

// ─── Player Avatar ───────────────────────────────────────────────────
function PlayerAvatar({ name, team, active = false }: { name: string; team: Team; active?: boolean }): ReactNode {
  const initials = name === 'You' ? 'YOU' : name.slice(0, 2).toUpperCase();
  const teamColors: Record<Team, string> = {
    RED: 'from-red-500 to-red-700',
    BLACK: 'from-gray-600 to-gray-900',
  };
  return (
    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${teamColors[team]} ${active ? 'ring-4 ring-yellow-400 scale-110 shadow-lg shadow-yellow-400/50' : 'ring-2 ring-gray-400/40'} flex items-center justify-center transition-all duration-300`}>
      <span className="text-white text-sm sm:text-base font-bold tracking-wider">{initials}</span>
    </div>
  );
}

// ─── Card Component ───────────────────────────────────────────────────
function CardC({ card, faceDown = false, small = false, onClick, highlighted = false, disabled = false }: {
  card?: Card | null; faceDown?: boolean; small?: boolean;
  onClick?: () => void; highlighted?: boolean; disabled?: boolean;
}): ReactNode {
  const sz = small ? 'w-10 h-14 sm:w-11 sm:h-16' : 'w-14 h-20 sm:w-16 sm:h-24 lg:w-20 lg:h-28';
  if (!card || faceDown) {
    return (
      <div className={`${sz} bg-gradient-to-br from-emerald-700 to-teal-800 border-2 border-emerald-500 rounded-lg shadow-md flex items-center justify-center`}
        aria-label="Face down card">
        <span className="text-emerald-200 text-xs font-bold">TH</span>
      </div>
    );
  }
  const isRed = card.suit === 'HEARTS' || card.suit === 'DIAMONDS';
  const color = isRed ? 'text-red-600' : 'text-gray-900';
  const tSz = small ? 'text-xs sm:text-sm' : 'text-sm sm:text-base lg:text-lg';
  const border = highlighted
    ? 'border-yellow-400 ring-2 ring-yellow-300 shadow-lg shadow-yellow-400/50 scale-105'
    : disabled ? 'border-gray-400 opacity-50' : 'border-gray-300 hover:border-blue-400 hover:shadow-md';

  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      className={`${sz} bg-white ${border} rounded-lg shadow-md flex flex-col items-center justify-center transition-all duration-150 ${disabled ? '' : 'active:scale-95 cursor-pointer'}`}
      aria-label={`${card.value} of ${card.suit}`}>
      <span className={`font-bold ${tSz} ${color} leading-none`}>{card.value}</span>
      <span className={`${tSz} ${color} leading-none`}>{SUIT_SYMBOLS[card.suit]}</span>
    </button>
  );
}

// ─── Compact Hand (mobile-only opponent stack) ───────────────────────
// One face-down card + a "×N" badge. Used for side opponents on mobile so the
// middle row doesn't overflow the viewport and AI names stay visible.
function CompactHand({ count, active = false }: { count: number; active?: boolean }): ReactNode {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative ${active ? 'scale-110' : ''} transition-transform duration-300`}>
        <CardC faceDown small />
        {count > 1 && (
          <span className="absolute -bottom-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-yellow-500 text-gray-900 text-[10px] font-extrabold flex items-center justify-center shadow ring-2 ring-gray-900">
            ×{count}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Hand Renderer ────────────────────────────────────────────────────
function HandR({ cards, label, hlSet, onClick, isMine = false, active = false, fd = false }: {
  cards: Card[]; label: string; hlSet?: Set<string>;
  onClick?: (c: Card) => void; isMine?: boolean; active?: boolean; fd?: boolean;
}): ReactNode {
  const sorted = sortCards(cards);
  return (
    <div className={`flex flex-col items-center gap-1 ${isMine ? 'w-full' : ''}`}>
      <span className={`text-xs font-semibold ${active ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>{label}</span>
      <div className={`flex ${isMine ? 'justify-center flex-wrap gap-1 sm:gap-2' : 'gap-1'} items-center`}>
        {sorted.map(c => (
          <CardC key={c.id} card={c} faceDown={fd} onClick={() => onClick?.(c)}
            highlighted={hlSet?.has(c.id) ?? false}
            disabled={isMine && hlSet !== undefined && !hlSet.has(c.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── Scoreboard (Unified Score Block) ────────────────────────────────
function ScoreBoard({ red, black }: { red: { points: number; isFaceUp: boolean }; black: { points: number; isFaceUp: boolean } }): ReactNode {
  const diff = red.points - black.points;
  const leader: 'RED' | 'BLACK' | 'TIED' = diff > 0 ? 'RED' : diff < 0 ? 'BLACK' : 'TIED';

  const scoreColor = leader === 'RED' ? 'text-red-400' : leader === 'BLACK' ? 'text-gray-200' : 'text-yellow-400';
  const bgGlow = leader === 'RED'
    ? 'from-red-900/40 to-gray-900/60 border-red-500/40'
    : leader === 'BLACK'
    ? 'from-gray-800/60 to-gray-900/60 border-gray-500/40'
    : 'from-yellow-900/30 to-gray-900/60 border-yellow-500/30';

  return (
    <div className={`w-full max-w-md mx-auto px-2 sm:px-4 mb-2 sm:mb-3 bg-gradient-to-r ${bgGlow} rounded-xl border p-2 sm:p-4 shadow-lg transition-all duration-500`}>
      {/* Top row: team scores */}
      <div className="flex justify-between items-center mb-1 sm:mb-2">
        <div className="flex items-center gap-1">
          <span className="text-red-400 text-base sm:text-lg">♥</span>
          <span className={`font-bold text-base sm:text-xl ${red.points > black.points ? 'text-red-400' : 'text-red-400/60'}`}>{red.points}</span>
          <span className="text-[10px] sm:text-xs text-gray-500">{red.isFaceUp ? '▲' : '▼'}</span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-yellow-500 text-[10px] sm:text-xs bg-yellow-900/50 px-1.5 sm:px-2 py-0.5 rounded-full mb-0.5 sm:mb-1">Goal: {MATCH_GOAL}</span>
          <span className={`text-xl sm:text-3xl font-black ${scoreColor} transition-colors duration-500`}>
            {red.points} — {black.points}
          </span>
          {leader !== 'TIED' && (
            <span className={`text-xs mt-0.5 ${leader === 'RED' ? 'text-red-300' : 'text-gray-400'}`}>
              {leader === 'RED' ? '♥ RED leads' : '♠ BLACK leads'} by {Math.abs(diff)}
            </span>
          )}
          {leader === 'TIED' && (
            <span className="text-xs mt-0.5 text-yellow-400">Tied</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] sm:text-xs text-gray-500">{black.isFaceUp ? '▲' : '▼'}</span>
          <span className={`font-bold text-base sm:text-xl ${black.points > red.points ? 'text-gray-200' : 'text-gray-200/60'}`}>{black.points}</span>
          <span className="text-gray-300 text-base sm:text-lg">♠</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden flex">
        <div className="h-full bg-red-500 transition-all duration-700 ease-out rounded-l-full"
          style={{ width: `${red.points + black.points > 0 ? (red.points / (red.points + black.points)) * 100 : 50}%` }} />
        <div className="h-full bg-gray-400 transition-all duration-700 ease-out rounded-r-full"
          style={{ width: `${red.points + black.points > 0 ? (black.points / (red.points + black.points)) * 100 : 50}%` }} />
      </div>
    </div>
  );
}

// ─── Bid-action label badge class (PASS / numeric / THANNI) ──────────
function bidBadgeClass(action: string): string {
  if (action === 'PASS') return 'bg-red-900/50 text-red-300';
  if (action === 'THANNI') return 'bg-purple-900/70 text-purple-200 ring-1 ring-purple-400/40';
  return 'bg-blue-900/50 text-blue-300';
}

// ─── Bidding Panel ────────────────────────────────────────────────────
function BidPanel({ cur, my, est, thanniEligible, thanniBlocked, onBid, onThanni, onPass }: {
  cur: Bid | null; my: boolean; est: number;
  thanniEligible: boolean;
  thanniBlocked: boolean; // true = sweep is guaranteed → disallow
  onBid: (n: number) => void;
  onThanni: () => void;
  onPass: () => void;
}): ReactNode {
  const [more, setMore] = useState(false);
  const min = cur ? cur.amount + 10 : 150;
  const std = [150, 160, 170, 200, 210, 220];
  const hi = [230, 240, 250, 260, 270, 280, 290, 300, 310, 320, 328];

  const btn = (amt: number) => {
    const ok = my && amt >= min && amt <= 328;
    return (
      <button key={amt} disabled={!ok} onClick={() => ok && onBid(amt)}
        className={`flex-1 py-2 px-2 rounded-lg font-bold text-xs sm:text-sm transition-all duration-150 active:scale-95 ${ok ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg cursor-pointer' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
        {getBidDisplayName(amt)} ({amt})
      </button>
    );
  };

  // Thanni is offered only on the player's FIRST bid action this round AND only
  // if their 4-card phase-1 hand is NOT a guaranteed sweep (genuine risk required).
  const canThanni = my && thanniEligible && !thanniBlocked;

  return (
    <div className="w-full max-w-lg mx-auto bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-3 sm:p-4 shadow-2xl border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white font-bold text-sm sm:text-base">BIDDING ROUND</h3>
        <span className="text-xs text-yellow-400">Est: ~{est}pts</span>
      </div>
      <div className="bg-gray-700/50 rounded-lg p-2 mb-3 text-center">
        <span className="text-xs text-gray-400 mr-1">Current Bid:</span>
        <span className="text-sm sm:text-base font-bold text-yellow-400">
          {cur ? `${getBidDisplayName(cur.amount, cur.kind)}${cur.kind === 'STANDARD' ? ` (${cur.amount})` : ''}` : 'None'}
        </span>
      </div>
      {/* Thanni bid button — only on first action this round */}
      <button
        disabled={!canThanni}
        onClick={() => canThanni && onThanni()}
        title={thanniEligible && thanniBlocked ? 'Hand is a guaranteed sweep — Thanni requires at least 1% risk' : 'Bid Thanni — win all 4 tricks with no trump, partner folded. +4 / −8 (and opp +8)'}
        className={`w-full py-2 px-3 mb-2 rounded-lg font-extrabold text-xs sm:text-sm transition-all duration-150 active:scale-95 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 ${canThanni ? 'bg-gradient-to-r from-purple-700 to-fuchsia-700 hover:from-purple-600 hover:to-fuchsia-600 text-white shadow-lg cursor-pointer' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <span className="text-yellow-300">★</span>
          Thanni
          <span className="text-green-300">+{THANNI_WIN_POINTS}</span>
          <span className="text-red-300">/ −{THANNI_FAIL_PENALTY}</span>
          <span className="sm:hidden text-[10px] opacity-90">(solo · no trump)</span>
        </span>
        <span className="hidden sm:inline text-xs opacity-90">(win all 4 tricks · no trump · partner folded)</span>
        {my && thanniEligible && thanniBlocked && (
          <span className="text-[10px] text-yellow-400">Sweep guaranteed — blocked</span>
        )}
      </button>
      <div className="flex flex-wrap gap-1 sm:gap-2 mb-2">{std.slice(0, 3).map(btn)}</div>
      <div className="flex flex-wrap gap-1 sm:gap-2 mb-2">{std.slice(3).map(btn)}</div>
      <button onClick={() => setMore(!more)} className="w-full text-xs text-gray-400 hover:text-white mb-2 transition">
        {more ? 'Hide Other Bids' : 'Show Other Bids'}
      </button>
      {more && <div className="flex flex-wrap gap-1 mb-2">{hi.filter(a => a >= min).map(btn)}</div>}
      <div className="flex justify-center mt-3 pt-2 border-t border-gray-600">
        <button disabled={!my} onClick={() => my && onPass()}
          className={`py-2 px-6 rounded-lg font-bold text-xs sm:text-sm transition-all active:scale-95 ${my ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg cursor-pointer' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}>
          Pass
        </button>
      </div>
    </div>
  );
}

// ─── Rules Modal ──────────────────────────────────────────────────────
// Rules content lives in RULES.md at the repo root (GitHub-discoverable) and
// is loaded here via Vite's `?raw` import. `Markdown` is a minimal renderer
// (no new dependency) that handles headings, bullets, numbered items, and
// auto-colors the words RED / BLACK / Thanni.
function RulesModal({ onClose }: { onClose: () => void }): ReactNode {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl border-2 border-yellow-500/50 max-w-2xl w-full max-h-[85vh] overflow-y-auto overflow-x-hidden p-5 sm:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-gradient-to-br from-gray-800 to-gray-900 -mx-5 sm:-mx-6 px-5 sm:px-6 pb-3 border-b border-gray-700 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-yellow-400">How to Play Thanni</h2>
          <button onClick={onClose} aria-label="Close"
            className="text-gray-400 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-all">×</button>
        </div>
        <Markdown content={rulesMarkdown} />
        <div className="flex justify-center mt-6 pt-4 border-t border-gray-700 sticky bottom-0 bg-gradient-to-br from-gray-800 to-gray-900 -mx-5 sm:-mx-6 px-5 sm:px-6">
          <button onClick={onClose}
            className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Thanni Result Modal (shown when a Thanni round ends) ─────────────
// Rendered when a Thanni or Hath Band (solo) round ends. The human face and
// AI face express opposite emotions depending on whether the user's team made
// or missed the bid. The "Next Hand" button triggers the regular post-round flow.
function SoloBidResultModal({ bidName, outcome, tricksTaken, totalTricks, winPoints, failPenalty, onNext, isMatchOver }: {
  bidName: 'Thanni' | 'Hath Band';
  outcome: 'WON' | 'LOST';
  tricksTaken: number;
  totalTricks: number;
  winPoints: number;
  failPenalty: number;
  onNext: () => void;
  isMatchOver: boolean;
}): ReactNode {
  const won = outcome === 'WON';
  const containerClasses = won
    ? 'bg-gradient-to-br from-emerald-800 to-green-950 border-emerald-400/60'
    : 'bg-gradient-to-br from-red-950 to-rose-900 border-red-500/60';
  const titleColor = won ? 'text-emerald-300' : 'text-red-300';
  const subtitle = won
    ? `You swept all ${totalTricks} tricks solo — ${bidName} made! Bidding team gains +${winPoints} match points.`
    : `Caller took only ${tricksTaken}/${totalTricks} tricks — ${bidName} missed. Opposition gains +${failPenalty} match points.`;
  const title = won
    ? `YOU WON ${bidName.toUpperCase()}!`
    : `YOU HAVE LOST THE ${bidName.toUpperCase()}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className={`rounded-2xl shadow-2xl border-2 max-w-md w-full p-6 text-center ${containerClasses}`}>
        {/* The two faces: human + AI on opposite emotional poles */}
        <div className="flex items-center justify-center gap-6 mb-3">
          {/* Human */}
          <div className="flex flex-col items-center">
            <div className={`text-6xl sm:text-7xl leading-none ${won ? 'animate-bounce' : ''}`}>
              {won ? '🤩' : '😢'}
            </div>
            <span className="text-xs mt-2 text-gray-300 font-semibold tracking-wider">YOU</span>
          </div>
          {/* Versus divider */}
          <span className="text-2xl text-gray-500 font-black">VS</span>
          {/* AI / Computer */}
          <div className="flex flex-col items-center">
            <div className={`text-6xl sm:text-7xl leading-none ${won ? '' : 'animate-pulse'}`}>
              {won ? '🤖' : '🤖😈'}
            </div>
            <span className="text-xs mt-2 text-gray-300 font-semibold tracking-wider">AI</span>
          </div>
        </div>
        <h2 className={`text-2xl sm:text-3xl font-black mb-2 ${titleColor}`}>
          {title}
        </h2>
        <p className="text-sm text-gray-300 mb-5 leading-relaxed">{subtitle}</p>
        <button onClick={onNext}
          className={`px-6 py-2 ${won ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'} text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95`}>
          {isMatchOver ? 'See Match Result' : 'Next Hand'}
        </button>
      </div>
    </div>
  );
}

// ─── Match Over Modal ──────────────────────────────────────────────────
function MatchOverModal({ winner, redPoints, blackPoints, pName, onNewMatch }: {
  winner: Team; redPoints: number; blackPoints: number;
  pName: (id: string) => string; onNewMatch: () => void;
}): ReactNode {
  const isRedWin = winner === 'RED';
  const winPartner1 = isRedWin ? pName('p0') : pName('p1');
  const winPartner2 = isRedWin ? pName('p2') : pName('p3');
  const winColor = isRedWin ? 'text-red-400' : 'text-gray-100';
  const ringColor = isRedWin
    ? 'border-red-500/60 from-red-900/40 to-gray-900/70'
    : 'border-gray-400/60 from-gray-800/60 to-gray-900/70';
  const scoreHighlight = isRedWin ? redPoints : blackPoints;
  const losingScore = isRedWin ? blackPoints : redPoints;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className={`bg-gradient-to-br ${ringColor} rounded-2xl shadow-2xl border-2 max-w-md w-full p-6 text-center`}>
        <div className="text-5xl mb-3 animate-bounce">🏆</div>
        <h2 className={`text-2xl sm:text-3xl font-black mb-1 ${winColor}`}>MATCH OVER</h2>
        <div className={`text-xl sm:text-2xl font-bold mb-4 ${winColor}`}>
          {isRedWin ? '♥ RED WINS' : '♠ BLACK WINS'}
        </div>
        <div className="text-sm text-gray-300 mb-2">
          {winPartner1} &amp; {winPartner2}
        </div>
        <div className="text-3xl font-black text-white mb-1">
          {scoreHighlight} — {losingScore}
        </div>
        <div className="text-xs text-gray-400 mb-5">final match points</div>
        <button onClick={onNewMatch}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow-lg transition-all active:scale-95">
          New Match
        </button>
      </div>
    </div>
  );
}

// ─── Lobby Screen ─────────────────────────────────────────────────────
function LobbyScreen({ onStart, onShowRules, onShowQuickStart, playerName, setPlayerName }: {
  onStart: () => void; onShowRules: () => void; onShowQuickStart: () => void;
  playerName: string; setPlayerName: (n: string) => void;
}): ReactNode {
  const teamColors: Record<Team, string> = { RED: 'from-red-500 to-red-700', BLACK: 'from-gray-600 to-gray-900' };
  const seats: Array<{ name: string; team: Team; pos: string }> = [
    { name: 'Arjun', team: 'RED', pos: 'North · Your Partner' },
    { name: 'Vikram', team: 'BLACK', pos: 'East · Left Opponent' },
    { name: playerName.trim() || 'You', team: 'RED', pos: 'South · YOU' },
    { name: 'Priya', team: 'BLACK', pos: 'West · Right Opponent' },
  ];
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 via-green-800 to-emerald-900 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="text-center mb-6">
        <h1 className="text-4xl sm:text-5xl font-black tracking-wider text-yellow-400 drop-shadow-lg">THANNI</h1>
        <p className="text-sm sm:text-base text-gray-300 mt-2">Traditional Indian 24-Card Bidding & Trick-Taking Game</p>
      </div>

      <div className="w-full max-w-md bg-gray-800/70 backdrop-blur-sm rounded-2xl shadow-2xl border-2 border-yellow-500/30 p-5 sm:p-6">
        <label htmlFor="player-name" className="block mb-1 text-sm font-semibold text-gray-300">Your Name</label>
        <input
          id="player-name" type="text" value={playerName} maxLength={14}
          onChange={e => setPlayerName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && playerName.trim()) onStart(); }}
          placeholder="Enter your name"
          className="w-full bg-gray-900 text-white px-4 py-3 rounded-lg border border-gray-600 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 outline-none text-sm sm:text-base mb-4 transition"
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <button onClick={onStart} disabled={!playerName.trim()}
            className={`px-4 py-3 font-bold rounded-lg shadow transition-all active:scale-95 ${playerName.trim() ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
            New Game
          </button>
          <button onClick={onShowQuickStart}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow transition-all active:scale-95">
            How to Play
          </button>
        </div>
        <div className="text-center mb-5">
          <button onClick={onShowRules} className="text-xs text-gray-400 hover:text-blue-300 underline transition">
            Full Rules
          </button>
        </div>

        <div className="border-t border-gray-700 pt-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">Your Table</h3>
          <div className="space-y-2">
            {seats.map(seat => {
              const initials = seat.name === 'You' ? 'YOU' : seat.name.slice(0, 2).toUpperCase();
              return (
                <div key={seat.pos} className="flex items-center gap-3">
                  <div className={`px-3 py-2 rounded-full bg-gradient-to-br ${teamColors[seat.team]} text-white text-xs font-bold flex-shrink-0 w-14 text-center`}>
                    {initials}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-white font-semibold">{seat.name}</span>
                    <span className="text-xs text-gray-400">{seat.pos}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-500 text-center">Offline single-player · You vs 3 AI bots</p>
    </div>
  );
}

// ─── Card Pick Screen ─────────────────────────────────────────────────
const DEALER_BY_SUIT: Record<Suit, string> = {
  HEARTS: 'p0',
  DIAMONDS: 'p1',
  SPADES: 'p2',
  CLUBS: 'p3',
};

function CardPickScreen({ cards, revealedCard, onPick, playerName }: {
  cards: Card[]; revealedCard: Card | null; onPick: (c: Card) => void; playerName: string;
}): ReactNode {
  const myName = playerName.trim() || 'You';
  const dealerInfo: Record<Suit, { seat: string; player: string; role: string }> = {
    HEARTS: { seat: 'North', player: 'Arjun', role: 'Your Partner deals' },
    DIAMONDS: { seat: 'East', player: 'Vikram', role: 'Left Opponent deals' },
    SPADES: { seat: 'South', player: myName, role: 'YOU deal!' },
    CLUBS: { seat: 'West', player: 'Priya', role: 'Right Opponent deals' },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 via-green-800 to-emerald-900 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-yellow-400 mb-2">Cut for Dealer</h2>
        {!revealedCard
          ? <p className="text-sm text-gray-300">Tap a face-down card — its suit determines the first dealer.</p>
          : <p className="text-sm text-gray-300">Revealing the dealer…</p>}
      </div>

      <div className="flex gap-3 sm:gap-5 mb-8 items-center justify-center min-h-[8rem]">
        {cards.map((c, i) => {
          const isPicked = revealedCard?.id === c.id;
          const rot = ['rotate-[-10deg]', 'rotate-[-4deg]', 'rotate-[4deg]', 'rotate-[10deg]'][i] ?? '';
          return (
            <button key={c.id} disabled={!!revealedCard} onClick={() => onPick(c)}
              className={`transition-all duration-500 ${rot} ${isPicked ? '-translate-y-6 scale-125 z-10' : revealedCard ? 'opacity-30 scale-90' : 'hover:-translate-y-3 hover:scale-105 cursor-pointer'}`}
              aria-label="Cut this card">
              <CardC card={isPicked ? c : undefined} faceDown={!isPicked} highlighted={isPicked} />
            </button>
          );
        })}
      </div>

      {revealedCard && (() => {
        const info = dealerInfo[revealedCard.suit];
        return (
          <div className="text-center animate-fadeIn">
            <div className="text-2xl sm:text-3xl font-bold text-yellow-400 mb-1">
              {SUIT_SYMBOLS[revealedCard.suit]} {revealedCard.suit.charAt(0) + revealedCard.suit.slice(1).toLowerCase()}
            </div>
            <div className="text-lg text-white font-semibold">{info.player}</div>
            <div className="text-sm text-gray-300">{info.seat} — {info.role}</div>
          </div>
        );
      })()}

      <div className="mt-8 text-xs text-gray-500 text-center max-w-sm">
        <p>♥ → Arjun (North) · ♦ → Vikram (East) · ♠ → You (South) · ♣ → Priya (West)</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN GAME COMPONENT
// ══════════════════════════════════════════════════════════════════════
export default function ThanniGame(): ReactNode {
  // ── Lobby / pre-game state
  const [gameStarted, setGameStarted] = useState(false);
  const [playerName, setPlayerNameState] = useState('');
  const playerNameRef = useRef('');
  const [showRules, setShowRules] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [soundMuted, setSoundMuted] = useState(isMuted());
  const [cardPickPhase, setCardPickPhase] = useState<'IDLE' | 'PICKING' | 'REVEAL'>('IDLE');
  const [pickCards, setPickCards] = useState<Card[]>([]);
  const [pickedCard, setPickedCard] = useState<Card | null>(null);

  // ── In-game state (existing)
  const [status, setStatus] = useState<GameStatus>('LOBBY');
  const [players, setPlayers] = useState<PlayerState[]>(() => [
    mkPlayer('p0', 'Arjun', 'RED', 'p2'),
    mkPlayer('p1', 'Vikram', 'BLACK', 'p3'),
    mkPlayer('p2', 'You', 'RED', 'p0', true),
    mkPlayer('p3', 'Priya', 'BLACK', 'p1'),
  ]);
  const [dealerId, setDealerId] = useState('p1');

  // Bidding
  const [curBid, setCurBid] = useState<Bid | null>(null);
  const [bidWinner, setBidWinner] = useState<string | null>(null);
  const [curBidder, setCurBidder] = useState('p2');
  const [, setPasses] = useState(0);
  const [bidLog, setBidLog] = useState<string[]>([]);
  const [bidActions, setBidActions] = useState<Record<string, string>>({});

  // Thanni bid
  const [thanniEligible, setThanniEligible] = useState<Record<string, boolean>>({
    p0: true, p1: true, p2: true, p3: true,
  });
  const thanniEligibleRef = useRef<Record<string, boolean>>({ p0: true, p1: true, p2: true, p3: true });
  const [isThanniRound, setIsThanniRound] = useState(false);
  const [thanniPartnerId, setThanniPartnerId] = useState<string | null>(null);
  // Result of a just-finished Thanni round, from the human's perspective.
  // 'WON' = the human's team won the Thanni; 'LOST' = the human's team lost it.
  // Set in scoreRound when a Thanni round ends; cleared on the next deal.
  const [thanniOutcome, setThanniOutcome] = useState<'WON' | 'LOST' | null>(null);

  // Hath Band call (post-bid solo all-tricks call). Any player may call after
  // phase-2 deal + trump set, before the first card is played. Partner is
  // folded; caller plays solo 1-vs-2; trump discarded.
  const [hathBandEligible, setHathBandEligible] = useState(false);
  const hathBandEligibleRef = useRef(false);
  const [isHathBandRound, setIsHathBandRound] = useState(false);
  const [hathBandCallerId, setHathBandCallerId] = useState<string | null>(null);
  const [hathBandPartnerId, setHathBandPartnerId] = useState<string | null>(null);
  const [hathBandOutcome, setHathBandOutcome] = useState<'WON' | 'LOST' | null>(null);

  // AI Mode badge re-render trigger. Bumped by the AIModeDropdown whenever a
  // seat's strategy changes so the inline status-row badge stays in sync.
  const [aiModeVersion, setAiModeVersion] = useState(0);

  // Trump
  const [trump, setTrump] = useState<Suit | null>(null);
  const [trumpCard, setTrumpCard] = useState<Card | null>(null);
  const [trumpDown, setTrumpDown] = useState(true);
  const [trumpOpen, setTrumpOpen] = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [trumpRevealedBy, setTrumpRevealedBy] = useState<string | null>(null);

  // Tricks
  const [trickNum, setTrickNum] = useState(0);
  const [turnPlayer, setTurnPlayer] = useState<string | null>(null);
  const [pile, setPile] = useState<PlayedCard[]>([]);
  const [results, setResults] = useState<TrickResult[]>([]);

  // Scores — differential balance persists across rounds.
// `balance > 0` ⇒ Red leads by `balance`, Black = 0; `balance < 0` ⇒ Black leads by `|balance|`, Red = 0.
// Only one team can ever be positive at a time (tug-of-war model).
const [balance, setBalance] = useState(0);
const [redFaceUp, setRedFaceUp] = useState(false);
const [blackFaceUp, setBlackFaceUp] = useState(false);
const redPts = Math.max(0, balance);
const blackPts = Math.max(0, -balance);

  // UI
  const [msg, setMsg] = useState('Welcome to Thanni!');
  const [roundMsg, setRoundMsg] = useState<string | null>(null);
  const [showTricksModal, setShowTricksModal] = useState(false);
  // Auto-opens on ROUND_SCORED (non-solo). Holds two actions: Review Tricks / Next Hand.
  // Cleared by deal() / handleNewMatch() so a fresh hand doesn't re-trigger it.
  const [showRoundScoredModal, setShowRoundScoredModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState<string>('');

  // Debug mode: reveals all hands + logs every AI decision (bids, card picks,
  // trick outcomes, scoring) so the engine/AI can be inspected live.
  const [debugMode, setDebugMode] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const debugModeRef = useRef(false);
  const setDebug = useCallback((on: boolean) => {
    debugModeRef.current = on;
    setDebugMode(on);
  }, []);
  const dbg = useCallback((line: string) => {
    if (!debugModeRef.current) return;
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    setDebugLog(prev => [...prev, `[${ts}] ${line}`]);
  }, []);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deckRef = useRef<Card[]>([]);
  const passesRef = useRef(0);
  const curBidRef = useRef<Bid | null>(null);
  const voidCheckRef = useRef(false);

  // ── Player name setter (synchronously updates ref + state)
  const setPlayerName = useCallback((name: string) => {
    setPlayerNameState(name);
    playerNameRef.current = name;
  }, []);

  // ── pName helper — uses ref so callbacks don't need to depend on player name
  const pName = useCallback((pid: string): string => {
    if (pid === PID) return playerNameRef.current.trim() || 'You';
    return BOT_NAMES[pid] ?? pid;
  }, []);

  // ── Create initial players using current player name from ref
  const getInitPlayers = useCallback((): PlayerState[] => [
    mkPlayer('p0', 'Arjun', 'RED', 'p2'),
    mkPlayer('p1', 'Vikram', 'BLACK', 'p3'),
    mkPlayer('p2', playerNameRef.current.trim() || 'You', 'RED', 'p0', true),
    mkPlayer('p3', 'Priya', 'BLACK', 'p1'),
  ], []);

  // helpers
  const gp = useCallback((pid: string) => players.find(p => p.id === pid)!, [players]);
  const gh = useCallback((pid: string) => gp(pid).hand, [gp]);
  const clr = useCallback(() => { if (timer.current) clearTimeout(timer.current); }, []);

  const setHand = useCallback((pid: string, h: Card[]) => {
    setPlayers(prev => prev.map(p => p.id === pid ? { ...p, hand: h } : p));
  }, []);

  const addStats = useCallback((pid: string, tw: number, pc: number) => {
    setPlayers(prev => prev.map(p => p.id === pid ? { ...p, tricksWon: p.tricksWon + tw, pointsCaptured: p.pointsCaptured + pc } : p));
  }, []);

  const isMy = turnPlayer === PID;
  const myHand = gh(PID);

  // Sweep pre-check for the human's Thanni bid button — true when the human's
  // current 4-card phase-1 hand guarantees a sweep against every possible opp deal
  // (genuine risk required to bid Thanni). Memoized by hand contents.
  const myHandKey = myHand.map(c => c.id).slice().sort().join(',');
  const thanniSweepGuaranteedForMe = useMemo(() => {
    if (myHand.length !== 4) return false;
    return isGuaranteedSweep(myHand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myHandKey]);

  const legalFor = useCallback((pid: string) =>
    getLegalCards(gh(pid), pile, trump, trumpOpen, pid, trumpRevealedBy, bidWinner, trumpCard),
    [gh, pile, trump, trumpOpen, trumpRevealedBy, bidWinner, trumpCard]);

  // ─── AI Strategy View Builders ──────────────────────────────────────
  // Construct read-only snapshots of the game state for the pluggable AI
  // strategies. In 'legacy' mode (per-seat feature flag), these are never
  // called — the UI invokes aiPickCard and the inline bidding heuristic
  // directly. In 'heuristic' / 'mcts' / 'ga' mode, the AI effects route
  // through getAIStrategy().chooseCard / chooseBid using these views.
  const buildCardplayView = useCallback((pid: string): CardplayView => {
    const me = gp(pid);
    const targetTrickCount = isThanniRound ? 4 : 6;
    const fullHands = new Map<string, Card[]>();
    for (const p of players) fullHands.set(p.id, p.hand);
    return {
      myId: pid,
      myHand: me.hand,
      legal: legalFor(pid),
      trickPile: pile,
      trump,
      trumpOpen,
      partnerId: me.partnerId,
      isSoloRound: isThanniRound || isHathBandRound,
      soloCallerId: isThanniRound ? bidWinner : isHathBandRound ? hathBandCallerId : null,
      foldedPartnerId: isThanniRound ? thanniPartnerId : isHathBandRound ? hathBandPartnerId : null,
      tricksRemaining: targetTrickCount - trickNum + 1,
      fullHands,
      balance,
      bidWinner,
      currentBid: curBid,
    };
  }, [gp, legalFor, isThanniRound, isHathBandRound, bidWinner, hathBandCallerId, thanniPartnerId, hathBandPartnerId, trickNum, pile, trump, trumpOpen, players, balance, curBid]);

  const buildBiddingView = useCallback((pid: string): BiddingView => {
    const cb = curBidRef.current;
    const minNextBid = cb ? cb.amount + 10 : MIN_BEAT;
    return {
      myId: pid,
      myHand: gh(pid),
      currentHighestBid: cb,
      minNextBid,
      passesSinceLastBid: passesRef.current,
      thanniEligible: !!thanniEligibleRef.current[pid],
      balance,
    };
  }, [gh, balance]);

  // ─── LOBBY / CARD-PICK HANDLERS ───
  const handleStartGame = useCallback(() => {
    if (!playerNameRef.current.trim()) return;
    initAudio(); // must be called from a user gesture for iOS/Chrome autoplay policy
    // Build 4 face-down cards, one from each suit, shuffled
    const deck = shuffleDeck(buildDeck());
    const pc: Card[] = [];
    const seen = new Set<Suit>();
    for (const c of deck) {
      if (!seen.has(c.suit)) { pc.push(c); seen.add(c.suit); }
      if (pc.length >= 4) break;
    }
    setPickCards(shuffleDeck(pc));
    setPickedCard(null);
    setCardPickPhase('PICKING');
  }, []);

  const handleCardPick = useCallback((card: Card) => {
    if (pickedCard) return;
    setPickedCard(card);
    setCardPickPhase('REVEAL');
    const newDealer = DEALER_BY_SUIT[card.suit];

    // After reveal animation, start the actual deal with the chosen dealer
    timer.current = setTimeout(() => {
      setDealerId(newDealer);
      // Update players' names (so "You" shows the user's entered name)
      setPlayers(getInitPlayers().map(p => ({ ...p })));
      setGameStarted(true);
      setCardPickPhase('IDLE');
      // deal() with override — state hasn't flushed yet, so pass directly
      deal(newDealer);
    }, 1800);
  }, [pickedCard, getInitPlayers]);

  const handleNewMatch = useCallback(() => {
    clr();
    setRedFaceUp(false); setBlackFaceUp(false); setBalance(0);
    setStatus('LOBBY');
    setGameStarted(false);
    setCardPickPhase('IDLE');
    setPickedCard(null);
    setPickCards([]);
    setCurBid(null); curBidRef.current = null;
    setBidWinner(null); setBidLog([]); setBidActions({});
    setThanniEligible({ p0: true, p1: true, p2: true, p3: true });
    thanniEligibleRef.current = { p0: true, p1: true, p2: true, p3: true };
    setIsThanniRound(false); setThanniPartnerId(null); setThanniOutcome(null); setHathBandEligible(false); hathBandEligibleRef.current = false; setIsHathBandRound(false); setHathBandCallerId(null); setHathBandPartnerId(null); setHathBandOutcome(null);
    setTrump(null); setTrumpCard(null); setTrumpDown(true); setTrumpOpen(false);
    setShowPick(false); setTrumpRevealedBy(null);
    setTrickNum(0); setTurnPlayer(null); setPile([]); setResults([]);
    setRoundMsg(null); setShowVoidModal(false); setVoidReason(''); voidCheckRef.current = false;
    setShowRoundScoredModal(false);
    setDebugLog([]);
    setMsg('Welcome back! Start a new match.');
  }, [clr]);

  // ─── DEAL NEW HAND ───
  const deal = useCallback((dealerOverride?: string) => {
    clr();
    const dId = dealerOverride ?? dealerId;
    const deck = shuffleDeck(buildDeck());
    const di = parseInt(dId.replace('p', ''));
    const h: Record<string, Card[]> = { p0: [], p1: [], p2: [], p3: [] };
    for (let i = 0; i < 16; i++) h[`p${(di + 1 + (i % 4)) % 4}`].push(deck[i]);
    deckRef.current = deck.slice(16);

    const fb = getNextPlayerClockwise(dId);
    // Build players with the current name from ref
    const initPlayers = getInitPlayers();
    setPlayers(initPlayers.map(p => ({ ...p, hand: sortCards(h[p.id]), tricksWon: 0, pointsCaptured: 0 })));
    setStatus('BIDDING_PHASE1');
    setCurBid(null); curBidRef.current = null;
    setBidWinner(null); setCurBidder(fb);
    setPasses(0); passesRef.current = 0; setBidLog([]); setBidActions({});
    setThanniEligible({ p0: true, p1: true, p2: true, p3: true });
    thanniEligibleRef.current = { p0: true, p1: true, p2: true, p3: true };
    setIsThanniRound(false); setThanniPartnerId(null); setThanniOutcome(null); setHathBandEligible(false); hathBandEligibleRef.current = false; setIsHathBandRound(false); setHathBandCallerId(null); setHathBandPartnerId(null); setHathBandOutcome(null);
    setTrump(null); setTrumpCard(null); setTrumpDown(true); setTrumpOpen(false); setShowPick(false); setTrumpRevealedBy(null);
    setTrickNum(0); setTurnPlayer(null); setPile([]); setResults([]); setRoundMsg(null);
    setShowRoundScoredModal(false);
    voidCheckRef.current = false; setShowVoidModal(false); setVoidReason('');
    setDebugLog([]);
    setMsg(`Cards dealt (4 each). ${pName(fb)} bids first.`);
    dbg(`─── NEW HAND · dealer=${pName(dId)} · firstBidder=${pName(fb)} ───`);
  }, [clr, dealerId, pName, getInitPlayers, dbg]);

  // ─── DEAL PHASE 2 ───
  const deal2 = useCallback(() => {
    const rem = deckRef.current;
    if (rem.length < 8) return; // guard: already dealt or StrictMode double-run
    deckRef.current = []; // clear immediately to prevent double-deal
    const di = parseInt(dealerId.replace('p', ''));
    setPlayers(prev => {
      const copy = prev.map(p => ({ ...p, hand: [...p.hand] }));
      for (let i = 0; i < 8; i++) {
        const t = (di + 1 + (i % 4)) % 4;
        const pl = copy.find(p => p.id === `p${t}`)!;
        pl.hand = sortCards([...pl.hand, rem[i]]);
      }
      // Void check: if opposition has NO trump cards, the round is void
      if (trump && bidWinner) {
        const bidTeam = copy.find(p => p.id === bidWinner)!.team;
        const opp = copy.filter(p => p.team !== bidTeam);
        const hasTrump = opp.some(p => p.hand.some(c => c.suit === trump));
        if (!hasTrump) voidCheckRef.current = true;
      }
      return copy;
    });
  }, [dealerId, trump, bidWinner]);

  // ─── BIDDING ───
  const doBid = useCallback((pid: string, amt: number) => {
    const b: Bid = { amount: amt, kind: 'STANDARD', playerId: pid, displayName: getBidDisplayName(amt), timestamp: Date.now() };
    setCurBid(b); curBidRef.current = b;
    setPasses(0); passesRef.current = 0;
    setBidLog(prev => [...prev, `${pName(pid)} bids ${getBidDisplayName(amt)} (${amt})`]);
    setBidActions(prev => ({ ...prev, [pid]: `${getBidDisplayName(amt)} (${amt})` }));
    // A numeric bid consumes this player's Thanni eligibility for the round.
    setThanniEligible(prev => ({ ...prev, [pid]: false }));
    thanniEligibleRef.current = { ...thanniEligibleRef.current, [pid]: false };
    setMsg(`${pName(pid)} bids ${getBidDisplayName(amt)}`);
    dbg(`BID ${pName(pid)} → ${getBidDisplayName(amt)} (${amt}) · hand=${fmtHand(gh(pid))}`);
    setCurBidder(getNextPlayerClockwise(pid));
  }, [pName, dbg, gh]);

  // Place a Thanni bid. Ends bidding immediately and jumps straight to THANNI_PLAYING.
  const doThanniBid = useCallback((pid: string) => {
    const b: Bid = { amount: THANNI_BID_AMOUNT, kind: 'THANNI', playerId: pid, displayName: 'Thanni', timestamp: Date.now() };
    setCurBid(b); curBidRef.current = b;
    setBidWinner(pid);
    const partnerId = players.find(p => p.id === pid)?.partnerId ?? null;
    setThanniPartnerId(partnerId);
    setIsThanniRound(true);
    setThanniEligible(prev => ({ ...prev, [pid]: false }));
    thanniEligibleRef.current = { ...thanniEligibleRef.current, [pid]: false };
    setBidLog(prev => [...prev, `${pName(pid)} bids Thanni — 4 tricks, no trump, partner folded!`]);
    setBidActions(prev => ({ ...prev, [pid]: 'THANNI' }));
    setMsg(`${pName(pid)} declares Thanni! Win all 4 tricks for +${THANNI_WIN_POINTS}, miss for -${THANNI_FAIL_PENALTY}.`);
    dbg(`THANNI ${pName(pid)} → solo bid · hand=${fmtHand(gh(pid))} · partner=${pName(players.find(p => p.id === pid)?.partnerId ?? '?')} folded`);
    // No phase-2 deal, no trump: jump straight to active play. Bidder leads.
    setTrump(null); setTrumpCard(null); setTrumpDown(false); setTrumpOpen(false);
    setShowPick(false); setTrumpRevealedBy(null);
    setTrickNum(1); setTurnPlayer(pid); setPile([]); setResults([]);
    setStatus('THANNI_PLAYING');
  }, [pName, players]);

  const doPass = useCallback((pid: string) => {
    const np = passesRef.current + 1;
    passesRef.current = np;
    setPasses(np);
    setBidLog(prev => [...prev, `${pName(pid)} passes`]);
    setBidActions(prev => ({ ...prev, [pid]: 'PASS' }));
    // A pass consumes this player's Thanni eligibility for the round.
    setThanniEligible(prev => ({ ...prev, [pid]: false }));
    thanniEligibleRef.current = { ...thanniEligibleRef.current, [pid]: false };
    setMsg(`${pName(pid)} passes.`);
    dbg(`PASS ${pName(pid)} · hand=${fmtHand(gh(pid))}`);

    const cb = curBidRef.current;
    if (!cb && np >= 4) {
      const fp = getNextPlayerClockwise(dealerId);
      const fb: Bid = { amount: 150, kind: 'STANDARD', playerId: fp, displayName: 'Beat', timestamp: Date.now() };
      setCurBid(fb); curBidRef.current = fb;
      setBidWinner(fp); setStatus('BIDDING_PHASE2');
      setBidLog(prev => [...prev, `All passed! ${pName(fp)} forced Beat`]);
      setMsg(`All passed! ${pName(fp)} forced to bid Beat.`);
      return;
    }
    if (cb && np >= 3) {
      setBidWinner(cb.playerId); setStatus('BIDDING_PHASE2');
      setMsg(`${pName(cb.playerId)} wins bid at ${getBidDisplayName(cb.amount)}!`);
      return;
    }
    setCurBidder(getNextPlayerClockwise(pid));
  }, [dealerId, pName, dbg, gh]);

  // AI bidding effect — consider Thanni first; otherwise route the numeric-bid
  // decision through the per-seat AI strategy (or the legacy inline heuristic).
  useEffect(() => {
    if (status !== 'BIDDING_PHASE1' || curBidder === PID || bidWinner) return;
    const t = setTimeout(() => {
      const hand = gh(curBidder);
      const cb = curBidRef.current;
      // Thanni: only on AI's first action this round AND only if not a guaranteed sweep (must carry real risk).
      // Always handled by the heuristic — strategies don't see Thanni decisions.
      // desperate = team is trailing AND opposition is at 10+ (close to winning at 12).
      const bidderTeam = gp(curBidder).team;
      const oppScore = bidderTeam === 'RED' ? Math.max(0, -balance) : Math.max(0, balance);
      const myScore = bidderTeam === 'RED' ? Math.max(0, balance) : Math.max(0, -balance);
      const desperate = oppScore >= 10 && myScore < oppScore;
      if (thanniEligibleRef.current[curBidder] && aiShouldBidThanni(hand, desperate) && !isGuaranteedSweep(hand)) {
        doThanniBid(curBidder);
        return;
      }
      // Feature-flag dispatch: 'legacy' bypasses the registry and inlines the
      // bidding heuristic (byte-identical to pre-refactor). Other modes route
      // through getAIStrategy().chooseBid with a BiddingView.
      const seatMode = getAISeatMode(curBidder);
      if (seatMode === 'legacy') {
        const eval4 = evaluateHand(hand);
        const projectedPoints = Math.round(eval4.adjustedScore * 1.5);
        const minA = cb ? cb.amount + 10 : 150;
        dbg(`AI-BID ${pName(curBidder)} [legacy] · estPts=${eval4.estimatedPoints} adj=${eval4.adjustedScore} proj=${projectedPoints} minNext=${minA} curBid=${cb ? cb.amount : '—'} · hand=${fmtHand(hand)}`);
        if (projectedPoints >= minA && minA <= 328) {
          const bidAmt = Math.max(minA, Math.ceil(projectedPoints / 10) * 10);
          bidAmt <= 328 ? doBid(curBidder, Math.min(bidAmt, 328)) : doPass(curBidder);
        } else {
          doPass(curBidder);
        }
      } else {
        const choice = getAIStrategy(curBidder).chooseBid(buildBiddingView(curBidder));
        dbg(`AI-BID ${pName(curBidder)} [${seatMode}] → ${choice.kind}${choice.kind === 'BID' ? ` ${choice.amount}` : ''} · hand=${fmtHand(hand)}`);
        if (choice.kind === 'BID' && choice.amount > 0) {
          doBid(curBidder, Math.min(choice.amount, MAX_BID));
        } else {
          doPass(curBidder);
        }
      }
    }, 800 + Math.random() * 700);
    return () => clearTimeout(t);
  }, [status, curBidder, curBid, bidWinner, gh, doBid, doPass, doThanniBid, buildBiddingView, dbg, pName]);

  // Bidding complete → trump selection (BEFORE dealing last 2 cards per PRD)
  useEffect(() => {
    if (status !== 'BIDDING_PHASE2' || !bidWinner || showPick) return;
    if (bidWinner === PID) {
      const t = setTimeout(() => setShowPick(true), 500);
      return () => clearTimeout(t);
    } else {
      const t1 = setTimeout(() => {
        setPlayers(cur => {
          const pl = cur.find(p => p.id === bidWinner)!;
          const bh = pl.hand;
          const sc: Record<string, number> = { HEARTS: 0, DIAMONDS: 0, SPADES: 0, CLUBS: 0 };
          for (const c of bh) sc[c.suit]++;
          const bestSuit = (Object.entries(sc)).sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0][0] as Suit;
          const cardsOfSuit = bh.filter(c => c.suit === bestSuit).sort((a, b) => a.pointValue - b.pointValue);
          const chosenCard = cardsOfSuit[0];
          setTrumpCard(chosenCard);
          setTrump(bestSuit); setTrumpDown(true); setStatus('TRUMP_SET');
          setMsg(`${pName(bidWinner)} set trump. Face down!`);
          dbg(`TRUMP-SET ${pName(bidWinner)} → ${SUIT_SYMBOLS[bestSuit as Suit]} (card ${fmtCard(chosenCard)} set aside) · suitCounts=${JSON.stringify(sc)} · hand=${fmtHand(bh)}`);
          return cur.map(p => p.id === bidWinner ? { ...p, hand: p.hand.filter(c => c.id !== chosenCard.id) } : p);
        });
      }, 1000);
      return () => clearTimeout(t1);
    }
  }, [status, bidWinner, showPick, pName, dbg]);

  // TRUMP_SET → deal remaining 2 cards → open the Hath Band eligibility gate.
  // The status stays at TRUMP_SET until EITHER someone calls Hath Band OR the
  // human dismisses the gate ("Start Play") — at which point we transition to
  // PLAYING with the lead at left-of-dealer. The void-round check runs here too.
  useEffect(() => {
    if (status !== 'TRUMP_SET') return;
    deal2();
    // Open the Hath Band eligibility gate; the AI/human effect handles dismissal.
    setHathBandEligible(true);
    hathBandEligibleRef.current = true;
    // Void round check: opposition has no trump cards → show modal & redeal.
    const t = setTimeout(() => {
      if (voidCheckRef.current) {
        const bidTeam = (bidWinner === 'p0' || bidWinner === 'p2') ? 'RED' : 'BLACK';
        const oppTeam = bidTeam === 'RED' ? 'BLACK' : 'RED';
        const oppIds: string[] = bidTeam === 'RED' ? ['p1', 'p3'] : ['p0', 'p2'];
        const oppNames = oppIds.map(id => pName(id)).join(' & ');
        setVoidReason(`The opposition (${oppNames} — ${oppTeam}) has no ${SUIT_SYMBOLS[trump!]} trump cards. The round is void and must be redealt.`);
        setShowVoidModal(true);
        setHathBandEligible(false);
        hathBandEligibleRef.current = false;
        setMsg('Round voided — opposition has no trump suit. Redealing...');
        return;
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [status, dealerId, deal2, pName, bidWinner, trump]);

  // Dismiss the Hath Band gate WITHOUT calling Hath Band — closes the
  // eligibility window and transitions to normal PLAYING with the lead at
  // left-of-dealer. Triggered by the human's "Start Play" button OR automatically
  // after a short timeout if no one (human or AI) calls Hath Band.
  const dismissHathBandGate = useCallback(() => {
    if (!hathBandEligibleRef.current) return;
    setHathBandEligible(false);
    hathBandEligibleRef.current = false;
    setStatus('PLAYING');
    const ld = getNextPlayerClockwise(dealerId);
    setTrickNum(1); setTurnPlayer(ld);
    setMsg(`Trick 1. ${pName(ld)} leads.`);
    dbg(`HATH-BAND-GATE dismissed — no call. Lead=${pName(ld)} · normal play starts`);
  }, [dealerId, pName, dbg]);

  // Call Hath Band: any player may invoke this. Partner folded; trump discarded
  // (its physical card returns to the bid winner's hand); caller leads trick 1;
  // status transitions to HATH_BAND_PLAYING. The eligibility window closes for everyone.
  const doHathBandCall = useCallback((pid: string) => {
    setHathBandEligible(false);
    hathBandEligibleRef.current = false;
    setIsHathBandRound(true);
    setHathBandCallerId(pid);
    const partnerId = players.find(p => p.id === pid)?.partnerId ?? null;
    setHathBandPartnerId(partnerId);
    // Always return the set-aside trump card to the bid winner's hand (per rules
    // — regardless of whether the bid winner ends up folded under Hath Band).
    if (trumpCard && bidWinner) {
      setPlayers(prev => prev.map(p => p.id === bidWinner
        ? { ...p, hand: sortCards([...p.hand, trumpCard]) }
        : p));
    }
    // Void trump.
    setTrump(null); setTrumpCard(null); setTrumpDown(false); setTrumpOpen(false);
    setCurBid({ amount: HATH_BAND_BID_AMOUNT, kind: 'HATH_BAND', playerId: pid, displayName: 'Hath Band', timestamp: Date.now() });
    curBidRef.current = { amount: HATH_BAND_BID_AMOUNT, kind: 'HATH_BAND', playerId: pid, displayName: 'Hath Band', timestamp: Date.now() };
    setBidActions(prev => ({ ...prev, [pid]: 'HATH_BAND' }));
    setTrickNum(1); setTurnPlayer(pid); setPile([]); setResults([]);
    setStatus('HATH_BAND_PLAYING');
    setMsg(`${pName(pid)} calls Hath Band! Win all 6 tricks solo for +${HATH_BAND_WIN_POINTS} or miss for a swing of ${HATH_BAND_FAIL_PENALTY}.`);
    setBidLog(prev => [...prev, `${pName(pid)} calls Hath Band! Solo 6-trick run, no trump, partner folded.`]);
    dbg(`HATH-BAND ${pName(pid)} → solo call · hand=${fmtHand(gh(pid))} · partner=${pName(players.find(p => p.id === pid)?.partnerId ?? '?')} folded · trump discarded`);
  }, [players, trumpCard, bidWinner, pName, dbg, gh]);

  // Live hands map for the Hath Band sweep check (memoized by card contents).
  const liveHandsMap = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const p of players) m.set(p.id, p.hand);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.map(p => p.id + ':' + p.hand.map(c => c.id).slice().sort().join(',')).join('|')]);

  // AI Hath Band calling effect — runs only while the eligibility gate is open.
  // Human-priority: wait ~1.2s before any AI evaluates so the human can act first.
  useEffect(() => {
    if (!hathBandEligible || isHathBandRound || isThanniRound) return;
    if (voidCheckRef.current) return; // round being voided — no Hath Band
    const t = setTimeout(() => {
      for (const cand of ['p0', 'p1', 'p3']) { // AIs only; PID = human
        const hand = gh(cand);
        if (hand.length !== 6) continue;
        const should = aiShouldCallHathBand(hand);
        const sweepGuaranteed = isHathBandGuaranteedSweep(cand, liveHandsMap);
        dbg(`HATH-BAND-CHECK ${pName(cand)} · heuristic=${should} sweepGuaranteed=${sweepGuaranteed} · hand=${fmtHand(hand)}`);
        if (should && !sweepGuaranteed) {
          doHathBandCall(cand);
          return;
        }
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [hathBandEligible, isHathBandRound, isThanniRound, gh, liveHandsMap, doHathBandCall, dbg, pName]);

  // Auto-dismiss the gate after ~5s of inactivity so the round proceeds naturally
  // even if no one calls Hath Band and the human doesn't click "Start Play".
  useEffect(() => {
    if (!hathBandEligible || isHathBandRound || isThanniRound) return;
    const t = setTimeout(() => dismissHathBandGate(), 5000);
    return () => clearTimeout(t);
  }, [hathBandEligible, isHathBandRound, isThanniRound, dismissHathBandGate]);

  const pickTrump = useCallback((card: Card) => {
    setTrump(card.suit); setTrumpCard(card); setTrumpDown(true); setShowPick(false); setStatus('TRUMP_SET');
    setPlayers(prev => prev.map(p => p.id === PID ? { ...p, hand: p.hand.filter(c => c.id !== card.id) } : p));
    setMsg(`Trump set to ${SUIT_SYMBOLS[card.suit]}. Card placed face-down!`);
    dbg(`TRUMP-SET ${pName(PID)} → ${SUIT_SYMBOLS[card.suit]} (card ${fmtCard(card)} set aside)`);
  }, [dbg, pName]);

  // Internal: perform a trump reveal and return the trump card to the bid winner.
  const doRevealTrump = useCallback((revealingPlayerId: string) => {
    if (!trump || trumpOpen) return;
    setTrumpOpen(true); setTrumpDown(false);
    setTrumpRevealedBy(revealingPlayerId);
    if (trumpCard && bidWinner) {
      setPlayers(prev => prev.map(p => p.id === bidWinner
        ? { ...p, hand: sortCards([...p.hand, trumpCard]) }
        : p));
    }
    setMsg(`Trump revealed: ${SUIT_SYMBOLS[trump]}! ${trumpCard ? trumpCard.value + SUIT_SYMBOLS[trump] + ' returns to hand. ' : ''}Must play trump if able.`);
    dbg(`TRUMP-REVEAL by ${pName(revealingPlayerId)} → ${SUIT_SYMBOLS[trump]}${trumpCard ? ` (${fmtCard(trumpCard)} back to ${pName(bidWinner ?? '?')})` : ''} · pile=${fmtPile(pile)}`);
  }, [trump, trumpOpen, trumpCard, bidWinner, dbg, pName, pile]);

  const revealTrump = useCallback(() => {
    if (!trump || trumpOpen) return;
    doRevealTrump(PID);
  }, [doRevealTrump, trump, trumpOpen]);

  // ─── SCORE ROUND (differential / tug-of-war) ───
  // The match is a single signed balance: positive = RED leads, negative = BLACK leads.
  // Any scoring event shifts the balance toward the gaining team — the "negate
  // the other team's positive balance first, overflow to winner" rule falls out
  // automatically from deriving each side's display as max(0, ±balance).
  const scoreRound = useCallback((res: TrickResult[]) => {
    if (!bidWinner || !curBid) return;
    const cf = curBidRef.current;
    if (!cf) return;
    let rp = 0, bp = 0;
    const isThanni = cf.kind === 'THANNI';
    const isHathBand = cf.kind === 'HATH_BAND';
    // In a solo round the "caller" is the Thanni bidder or the Hath Band caller
    // (not necessarily the bid winner — Hath Band can be called by anyone).
    const soloCallerId =
      isThanni ? bidWinner :
      isHathBand ? hathBandCallerId :
      bidWinner;
    let callerTricksWon = 0;
    for (const t of res) {
      const tot = t.playedCards.reduce((s, x) => s + x.card.pointValue, 0);
      gp(t.winnerPlayerId).team === 'RED' ? (rp += tot) : (bp += tot);
      if (soloCallerId && t.winnerPlayerId === soloCallerId) callerTricksWon++;
    }
    const bt = gp(bidWinner).team;
    const btp = bt === 'RED' ? rp : bp;
    // Determine the gaining team + amount for this round.
    let gainTeam: Team;
    let gainAmount: number;
    let resultLabel: string;
    let soloMade = false;
    let soloCallerTeam: Team | null = null;
    if (isThanni) {
      const targetTricks = isThanniRound ? 4 : 6;
      soloMade = callerTricksWon >= targetTricks;
      gainTeam = soloMade ? bt : (bt === 'RED' ? 'BLACK' : 'RED');
      gainAmount = soloMade ? THANNI_WIN_POINTS : THANNI_FAIL_PENALTY;
      soloCallerTeam = bt;
      resultLabel = `${bt} ${soloMade ? 'made' : 'missed'} Thanni — bidder took ${callerTricksWon}/${targetTricks} tricks.`;
    } else if (isHathBand && soloCallerId) {
      const callerTeam = gp(soloCallerId).team;
      soloCallerTeam = callerTeam;
      const target = HATH_BAND_TRICK_COUNT;
      soloMade = callerTricksWon >= target;
      gainTeam = soloMade ? callerTeam : (callerTeam === 'RED' ? 'BLACK' : 'RED');
      gainAmount = soloMade ? HATH_BAND_WIN_POINTS : HATH_BAND_FAIL_PENALTY;
      resultLabel = `${callerTeam} ${soloMade ? 'made' : 'missed'} Hath Band — caller took ${callerTricksWon}/${target} tricks.`;
    } else {
      const met = btp >= cf.amount;
      const hv = cf.amount >= 200;
      const mm = hv ? 2 : 1, fm = hv ? 4 : 2;
      gainTeam = met ? bt : (bt === 'RED' ? 'BLACK' : 'RED');
      gainAmount = met ? mm : fm;
      resultLabel = `${bt} ${met ? 'made' : 'missed'} ${getBidDisplayName(cf.amount)}.`;
    }
    // Apply the single signed shift to the differential balance.
    const newBalance = balance + (gainTeam === 'RED' ? gainAmount : -gainAmount);
    const nrp = Math.max(0, newBalance);
    const nbp = Math.max(0, -newBalance);
    setBalance(newBalance);
    if (nrp > 0) setRedFaceUp(true);
    if (nbp > 0) setBlackFaceUp(true);

    // For a solo round (Thanni or Hath Band), capture the user's perspective
    // (WON / LOST) so the result modal can render with happy/sad faces.
    // PID is on RED; the user's team "won the solo" iff the solo caller's team
    // is RED AND the solo succeeded, OR the solo caller's team is BLACK AND the
    // solo failed (opposition caller missing the call benefits RED).
    if ((isThanni || isHathBand) && soloCallerTeam) {
      const userWon = (soloCallerTeam === 'RED') === soloMade;
      if (isThanni) setThanniOutcome(userWon ? 'WON' : 'LOST');
      else setHathBandOutcome(userWon ? 'WON' : 'LOST');
    }

    const rm = `${resultLabel} Red ${rp}pts, Black ${bp}pts. Match: Red ${nrp}, Black ${nbp}.`;
    setRoundMsg(rm); setMsg(rm);
    dbg(`SCORE · ${resultLabel} gain=${gainTeam}+${gainAmount} · balance=${balance}→${newBalance} (RED ${nrp} · BLACK ${nbp})${soloCallerTeam ? ` · soloCaller=${soloCallerTeam} made=${soloMade}` : ''}`);

    if (newBalance >= MATCH_GOAL) { setStatus('MATCH_OVER'); setMsg(`🔴 ${pName('p0')}/${pName('p2')} WIN! ${nrp}-${nbp}`); }
    else if (newBalance <= -MATCH_GOAL) { setStatus('MATCH_OVER'); setMsg(`⚫ ${pName('p1')}/${pName('p3')} WIN! ${nbp}-${nrp}`); }
    else {
      setStatus('ROUND_SCORED');
      setDealerId(computeNextDealer(dealerId, nrp, nbp, players));
    }
  }, [bidWinner, curBid, isThanniRound, hathBandCallerId, gp, balance, dealerId, players, pName]);

  // Auto-open the Round Scored modal (Review Tricks / Next Hand) when a regular
  // round ends. Solo rounds (Thanni / Hath Band) are handled by SoloBidResultModal.
  useEffect(() => {
    if (status === 'ROUND_SCORED' && !thanniOutcome && !hathBandOutcome) {
      setShowRoundScoredModal(true);
    }
  }, [status, thanniOutcome, hathBandOutcome]);

  // ─── PLAY A CARD ───
  // Trick size: 4 in a normal round, 3 in a solo round (Thanni / Hath Band — partner folded).
  // Round length: 6 tricks normally, 4 in a Thanni round (phase-1 cards only), 6 in Hath Band (full hand).
  const isSoloRound = isThanniRound || isHathBandRound;
  const soloCallerId: string | null =
    isThanniRound ? (bidWinner ?? null) :
    isHathBandRound ? hathBandCallerId :
    null;
  const soloTargetTricks = isThanniRound ? 4 : isHathBandRound ? HATH_BAND_TRICK_COUNT : 6;
  const foldedPartnerId = isThanniRound ? thanniPartnerId : isHathBandRound ? hathBandPartnerId : null;

  const playCard = useCallback((pid: string, card: Card) => {
    setHand(pid, gh(pid).filter(c => c.id !== card.id));
    const pc: PlayedCard = { card, playerId: pid, trickNumber: trickNum, positionInTrick: pile.length + 1 };
    const np = [...pile, pc];
    setPile(np);
    if (pid !== PID) setMsg(`${pName(pid)} plays ${card.value}${SUIT_SYMBOLS[card.suit]}`);

    // Use fresh closure values for trick size / count (avoid stale state inside setTimeout).
    const sz = isSoloRound ? 3 : 4;
    const totalTricks = soloTargetTricks;
    const foldedPartner = foldedPartnerId;
    const skipNext = (id: string): string => {
      let n = getNextPlayerClockwise(id);
      if (foldedPartner && n === foldedPartner) n = getNextPlayerClockwise(n);
      return n;
    };

    if (np.length === sz) {
      if (pid === PID) dbg(`PLAY ${pName(pid)} → ${fmtCard(card)} · pile-before=${fmtPile(pile)} → resolves`);
      setTimeout(() => {
        // Solo rounds have no trump; standard rounds honor the reveal state.
        const res = evaluateTrickWithContext(np, (isSoloRound ? false : trumpOpen) ? trump : null);
        const tot = np.reduce((s, x) => s + x.card.pointValue, 0);
        addStats(res.winnerPlayerId, 1, tot);
        const nr = [...results, res];
        setResults(nr);
        setMsg(`${pName(res.winnerPlayerId)} wins trick ${trickNum} (+${tot}pts)!`);
        dbg(`TRICK-WIN #${trickNum} → ${pName(res.winnerPlayerId)} (+${tot}pts) · pile=${fmtPile(np)}`);
        // Solo early-termination: the caller must win every trick. If they lose
        // even one, the round ends immediately — skip the "next trick" continuation
        // and jump straight to scoring with the partial trick history.
        const callerLostTrick = isSoloRound && soloCallerId !== null && res.winnerPlayerId !== soloCallerId;
        if (callerLostTrick) dbg(`SOLO-END ${pName(soloCallerId!)} lost trick ${trickNum} — round ends early (caller took ${nr.filter(r => r.winnerPlayerId === soloCallerId).length} tricks)`);
        setTimeout(() => {
          setPile([]);
          if (!callerLostTrick && trickNum < totalTricks) {
            setTrickNum(n => n + 1);
            setTurnPlayer(res.winnerPlayerId);
            setMsg(`Trick ${trickNum + 1}. ${pName(res.winnerPlayerId)} leads.`);
          } else {
            scoreRound(nr);
          }
        }, 1500);
      }, 800);
    } else {
      if (pid === PID) dbg(`PLAY ${pName(pid)} → ${fmtCard(card)} · pile-before=${fmtPile(pile)}`);
      const next = skipNext(pid);
      setTurnPlayer(next);
      if (next === PID) setMsg('Your turn — play a card.');
    }
  }, [setHand, gh, trickNum, pile, trump, trumpOpen, results, addStats, scoreRound, pName, isSoloRound, soloTargetTricks, foldedPartnerId, soloCallerId, dbg]);

  const userPlay = useCallback((card: Card) => {
    if (turnPlayer !== PID || (status !== 'PLAYING' && status !== 'TRUMP_REVEALED' && status !== 'THANNI_PLAYING' && status !== 'HATH_BAND_PLAYING')) return;
    const legal = legalFor(PID);
    if (!legal.some(c => c.id === card.id)) { setMsg('Cannot play that card — follow suit!'); return; }
    playCard(PID, card);
  }, [turnPlayer, status, legalFor, playCard]);

  // AI trump-reveal effect — no-op during any solo round (no trump at all).
  useEffect(() => {
    if (isSoloRound) return;
    if (status !== 'PLAYING' || trumpOpen || !trump || pile.length === 0) return;
    if (!turnPlayer || turnPlayer === PID) return;
    const hand = gh(turnPlayer);
    const ledSuit = pile[0].card.suit;
    const canFollow = hand.some(c => c.suit === ledSuit);
    if (canFollow) return;
    const t = setTimeout(() => doRevealTrump(turnPlayer), 500 + Math.random() * 400);
    return () => clearTimeout(t);
  }, [status, turnPlayer, pile.length, trumpOpen, trump, gh, pile, doRevealTrump, isSoloRound]);

  // AI trick play — also runs in THANNI_PLAYING and HATH_BAND_PLAYING.
  // Skips the folded partner in solo rounds.
  useEffect(() => {
    if (status !== 'PLAYING' && status !== 'TRUMP_REVEALED' && status !== 'THANNI_PLAYING' && status !== 'HATH_BAND_PLAYING') return;
    if (!turnPlayer || turnPlayer === PID) return;
    if (isSoloRound && turnPlayer === foldedPartnerId) return; // folded
    const sz = isSoloRound ? 3 : 4;
    if (pile.length >= sz) return;
    const t = setTimeout(() => {
      const hand = gh(turnPlayer);
      if (!hand.length) return;
      const legal = legalFor(turnPlayer);
      if (!legal.length) return;
      // Feature-flag dispatch: 'legacy' bypasses the registry and calls
      // aiPickCard directly (byte-identical to pre-refactor behavior). Any
      // other mode routes through getAIStrategy().chooseCard with a full view.
      const seatMode = getAISeatMode(turnPlayer);
      let pick: Card;
      if (seatMode === 'legacy') {
        const me = gp(turnPlayer);
        pick = aiPickCard(legal, pile, turnPlayer, me.partnerId, isSoloRound ? false : trumpOpen, isSoloRound ? null : trump);
        dbg(`AI-PLAY ${pName(turnPlayer)} [legacy] trick=${trickNum} pos=${pile.length + 1} → ${fmtCard(pick)} · legal=[${fmtHand(legal)}] · pile=${fmtPile(pile)} trumpOpen=${trumpOpen} trump=${trump ? SUIT_SYMBOLS[trump] : '—'}`);
      } else {
        pick = getAIStrategy(turnPlayer).chooseCard(buildCardplayView(turnPlayer));
        dbg(`AI-PLAY ${pName(turnPlayer)} [${seatMode}] trick=${trickNum} pos=${pile.length + 1} → ${fmtCard(pick)} · legal=[${fmtHand(legal)}] · pile=${fmtPile(pile)}`);
      }
      playCard(turnPlayer, pick);
    }, 600 + Math.random() * 800);
    return () => clearTimeout(t);
  }, [status, turnPlayer, pile.length, gh, legalFor, playCard, trump, trumpOpen, gp, isSoloRound, foldedPartnerId, buildCardplayView, dbg, pName, trickNum]);

  const isInteractiveStatus = status === 'PLAYING' || status === 'TRUMP_REVEALED' || status === 'THANNI_PLAYING' || status === 'HATH_BAND_PLAYING';
  const legalIds = isInteractiveStatus && isMy
    ? new Set(legalFor(PID).map(c => c.id)) : undefined;

  // ── Sound effects — play a chime when the human needs to act ──
  useEffect(() => {
    if (isInteractiveStatus && turnPlayer === PID) {
      playSound('yourTurn');
    }
  }, [isInteractiveStatus, turnPlayer]);

  useEffect(() => {
    if (status === 'BIDDING_PHASE1' && curBidder === PID && !bidWinner) {
      playSound('yourBid');
    }
  }, [status, curBidder, bidWinner]);

  useEffect(() => {
    if (showPick) playSound('pickTrump');
  }, [showPick]);

  useEffect(() => {
    if (status === 'ROUND_SCORED' || status === 'MATCH_OVER') {
      playSound('roundEnd');
    }
  }, [status]);

  const handleVoidRedeal = useCallback(() => {
    setShowVoidModal(false);
    setVoidReason('');
    voidCheckRef.current = false;
    deal();
  }, [deal]);

  // ══════════════════════════════════════════════════════════════════════
  // RENDER — LOBBY / CARD-PICK SCREENS
  // ══════════════════════════════════════════════════════════════════════
  if (!gameStarted) {
    return (
      <>
        {showRules && <RulesModal onClose={() => setShowRules(false)} />}
        {showQuickStart && <QuickStartGuide onClose={() => setShowQuickStart(false)} />}
        {cardPickPhase === 'PICKING' || cardPickPhase === 'REVEAL' ? (
          <CardPickScreen
            cards={pickCards}
            revealedCard={pickedCard}
            onPick={handleCardPick}
            playerName={playerName}
          />
        ) : (
          <LobbyScreen
            onStart={handleStartGame}
            onShowRules={() => setShowRules(true)}
            onShowQuickStart={() => setShowQuickStart(true)}
            playerName={playerName}
            setPlayerName={setPlayerName}
          />
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER — MAIN GAME TABLE
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 via-green-800 to-emerald-900 flex flex-col items-center p-1 sm:p-4 overflow-auto pb-4 sm:pb-8">
      {/* Header */}
      <div className="w-full max-w-4xl mx-auto mb-2">
        <div className="flex items-center justify-between gap-1">
          <h1 className="text-xl sm:text-2xl font-bold text-yellow-400 drop-shadow-lg flex-shrink-0">THANNI</h1>
          <div className="flex items-center gap-1 sm:gap-3 flex-wrap justify-end">
            <AIModeDropdown onChange={() => setAiModeVersion(v => v + 1)} />
            <button
              onClick={() => setDebug(!debugMode)}
              title="Toggle debug mode: reveal all hands + log every AI decision"
              className={`text-xs sm:text-sm font-bold px-1.5 sm:px-2 py-1 rounded-lg border transition-all ${debugMode ? 'bg-orange-600 border-orange-400 text-white' : 'bg-gray-800 border-gray-600 text-orange-300 hover:bg-gray-700'}`}>
              <span className="sm:hidden">🐛{debugMode ? '✓' : ''}</span>
              <span className="hidden sm:inline">🐛 Debug: {debugMode ? 'ON' : 'OFF'}</span>
            </button>
            <button
              onClick={() => { toggleMute(); setSoundMuted(isMuted()); }}
              title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
              className="text-xs sm:text-sm px-1.5 sm:px-2 py-1 rounded-lg border transition-all bg-gray-800 border-gray-600 hover:bg-gray-700 text-gray-300">
              {soundMuted ? '🔇' : '🔊'}
            </button>
            <button onClick={() => setShowRules(true)}
              className="text-xs sm:text-sm text-blue-300 hover:text-blue-200 underline">Rules</button>
          </div>
        </div>
        <div className="flex items-center justify-center gap-x-2 gap-y-0.5 mt-1 text-[11px] sm:text-sm text-gray-300 flex-wrap">
          <span>Status: <strong className="text-yellow-300">{status}</strong></span>
          {trump && !trumpDown && <span className="text-red-400 font-bold">Trump: {SUIT_SYMBOLS[trump]}</span>}
          <span>Trick: {trickNum}/{isThanniRound ? 4 : 6}{isThanniRound ? ' · THANNI' : isHathBandRound ? ' · HATH BAND' : ''}</span>
          <span>Dealer: {pName(dealerId)}</span>
          {/* AI Mode badge — only visible when at least one AI seat is non-default. */}
          {(() => { void aiModeVersion; // re-render trigger
            if (isDefaultMode()) return null;
            const m = getAIMode();
            const tags = (['p0', 'p1', 'p3'] as string[]).filter(s => m[s] !== 'legacy').map(s => `${s}:${m[s]}`).join(' · ');
            return <span className="text-[10px] sm:text-xs italic text-purple-300">AI: {tags}</span>;
          })()}
        </div>
      </div>

      <ScoreBoard red={{ points: redPts, isFaceUp: redFaceUp }} black={{ points: blackPts, isFaceUp: blackFaceUp }} />

      {msg && (
        <div className="w-full max-w-2xl mx-auto mt-2 p-2 bg-gray-800/60 rounded-lg text-center border border-yellow-500/30">
          <span className="text-sm sm:text-base text-yellow-300 font-medium">{msg}</span>
        </div>
      )}

      {(status === 'BIDDING_PHASE1') && bidLog.length > 0 && (
        <div className="w-full max-w-md mx-auto mt-2 p-2 bg-gray-900/60 rounded-lg border border-gray-700 max-h-24 overflow-y-auto">
          {bidLog.map((l, i) => <div key={i} className="text-xs text-gray-400">{l}</div>)}
        </div>
      )}

      {/* Debug panel — revealed when debug mode is on. Shows every AI decision
          (bids, card picks with legal options, trick outcomes, scoring) plus
          all hands at the top of each hand. */}
      {debugMode && (
        <div className="w-full max-w-3xl mx-auto mt-2 p-2 bg-gray-950/80 rounded-lg border border-orange-500/40 shadow-lg flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-orange-300 tracking-wider">🐛 DEBUG LOG ({debugLog.length})</span>
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard?.writeText(debugLog.join('\n'))}
                className="text-[10px] text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-0.5">Copy</button>
              <button onClick={() => setDebugLog([])}
                className="text-[10px] text-gray-300 hover:text-white border border-gray-600 rounded px-2 py-0.5">Clear</button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto font-mono text-[11px] leading-tight">
            {debugLog.length === 0
              ? <div className="text-gray-500 italic px-1 py-2">No events yet — start a hand.</div>
              : debugLog.map((l, i) => {
                  const tone = l.startsWith('───')
                    ? 'text-orange-300 font-bold'
                    : l.startsWith('AI-') ? 'text-cyan-300'
                    : l.startsWith('TRICK') ? 'text-green-300'
                    : l.startsWith('SCORE') ? 'text-yellow-300'
                    : l.startsWith('THANNI') || l.startsWith('HATH') ? 'text-purple-300'
                    : 'text-gray-300';
                  return <div key={i} className={`px-1 ${tone}`}>{l}</div>;
                })}
          </div>
        </div>
      )}

      {/* GAME TABLE */}
      <div className="w-full max-w-4xl flex flex-col items-center justify-center flex-1 relative mt-2">
        {/* Top (p0 = Partner) */}
        <div className="w-full flex justify-center mb-1 sm:mb-2">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-1">
              <PlayerAvatar name={pName('p0')} team={gp('p0').team} active={turnPlayer === 'p0'} />
              <span className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${turnPlayer === 'p0' ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>{pName('p0')} — {gh('p0').length} cards</span>
            </div>
            <div className="sm:hidden"><CompactHand count={gh('p0').length} active={turnPlayer === 'p0'} /></div>
            <div className="hidden sm:block"><HandR cards={gh('p0')} label="" active={turnPlayer === 'p0'} fd={!debugMode} /></div>
            {status === 'BIDDING_PHASE1' && bidActions['p0'] && (
              <span className={`text-xs font-bold mt-1 px-2 py-0.5 rounded ${bidBadgeClass(bidActions['p0'])}`}>{bidActions['p0']}</span>
            )}
            {(status === 'PLAYING' || status === 'TRUMP_REVEALED') && gp('p0').tricksWon > 0 && (
              <span className="text-xs text-gray-300 mt-1">🏆 {gp('p0').tricksWon} tricks · {gp('p0').pointsCaptured}pts</span>
            )}
          </div>
        </div>

        <div className="w-full flex items-center justify-center gap-2 sm:gap-4 flex-1">
          {/* Left (p3) */}
          <div className="flex-shrink-0 flex flex-col items-center w-16 sm:w-auto">
            <PlayerAvatar name={pName('p3')} team={gp('p3').team} active={turnPlayer === 'p3'} />
            <span className={`text-xs sm:text-sm font-semibold mt-1 whitespace-nowrap text-center ${turnPlayer === 'p3' ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>{pName('p3')}</span>
            <div className="sm:hidden mt-1"><CompactHand count={gh('p3').length} active={turnPlayer === 'p3'} /></div>
            <div className="hidden sm:block"><HandR cards={gh('p3')} label="" active={turnPlayer === 'p3'} fd={!debugMode} /></div>
            {status === 'BIDDING_PHASE1' && bidActions['p3'] && (
              <span className={`text-xs font-bold mt-1 px-2 py-0.5 rounded ${bidBadgeClass(bidActions['p3'])}`}>{bidActions['p3']}</span>
            )}
            {(status === 'PLAYING' || status === 'TRUMP_REVEALED') && gp('p3').tricksWon > 0 && (
              <span className="text-xs text-gray-300 mt-1">🏆 {gp('p3').tricksWon} · {gp('p3').pointsCaptured}pts</span>
            )}
          </div>

          {/* Center */}
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm sm:max-w-md">
            {/* Winning Bid info (during play + scoring) */}
            {curBid && bidWinner && (status === 'PLAYING' || status === 'TRUMP_REVEALED' || status === 'THANNI_PLAYING' || status === 'HATH_BAND_PLAYING' || status === 'ROUND_SCORED') && (() => {
              const bidTeam = gp(bidWinner).team;
              const partnerName = pName(gp(bidWinner).partnerId);
              const isThanniBid = curBid.kind === 'THANNI';
              const isHathBandBid = curBid.kind === 'HATH_BAND';
              const isSoloBid = isThanniBid || isHathBandBid;
              // For Hath Band, the solo caller may differ from the bid winner;
              // the banner shows the caller's name and team.
              const soloCaller = isHathBandBid ? hathBandCallerId : bidWinner;
              const soloTeam = soloCaller ? gp(soloCaller).team : bidTeam;
              const soloPartner = soloCaller ? pName(gp(soloCaller).partnerId) : partnerName;
              return (
                <div className={`mb-3 px-3 py-1.5 rounded-lg text-center w-full max-w-xs ${isSoloBid ? (isThanniBid ? 'bg-purple-900/70 border border-purple-400/60' : 'bg-amber-900/70 border border-amber-400/60') : 'bg-gray-900/60 border border-yellow-500/40'}`}>
                  <div className="text-xs text-gray-400">{isThanniBid ? 'Thanni Bid' : isHathBandBid ? 'Hath Band Call' : 'Winning Bid'}</div>
                  <div className={`text-sm font-bold ${isHathBandBid ? 'text-amber-200' : isThanniBid ? 'text-purple-200' : bidTeam === 'RED' ? 'text-red-400' : 'text-gray-200'}`}>
                    {isThanniBid
                      ? `Thanni — ${soloTeam === 'RED' ? '♥ RED' : '♠ BLACK'} (No Trump)`
                      : isHathBandBid
                      ? `Hath Band — ${soloTeam === 'RED' ? '♥ RED' : '♠ BLACK'} (No Trump)`
                      : `${getBidDisplayName(curBid.amount)} (${curBid.amount}) — ${bidTeam === 'RED' ? '♥ RED' : '♠ BLACK'}`}
                  </div>
                  <div className="text-xs text-gray-400">
                    {isSoloBid
                      ? `by ${soloCaller ? pName(soloCaller) : '?'} (solo)`
                      : `by ${pName(bidWinner)} & ${partnerName}`}
                  </div>
                  {isThanniBid && (
                    <div className="text-[10px] sm:text-xs text-purple-300 mt-1">
                      Win all 4 tricks: <span className="text-green-300">+{THANNI_WIN_POINTS}</span> · Miss: <span className="text-red-300">opp +{THANNI_FAIL_PENALTY}</span>
                      <br /> {soloPartner} folded — solo 1 vs 2
                    </div>
                  )}
                  {isHathBandBid && (
                    <div className="text-[10px] sm:text-xs text-amber-300 mt-1">
                      Win all 6 tricks: <span className="text-green-300">+{HATH_BAND_WIN_POINTS}</span> · Miss: <span className="text-red-300">opp +{HATH_BAND_FAIL_PENALTY}</span>
                      <br /> Trump discarded · {soloPartner} folded — solo 1 vs 2
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Hath Band eligibility prompt — between phase-2 deal + trump set
                and the first card play. Any player may call. Gated by the
                per-card sweep check (sweep-guaranteed hands are disallowed). */}
            {status === 'TRUMP_SET' && hathBandEligible && !isThanniRound && !isHathBandRound && (() => {
              const mySweepGuaranteed = isHathBandGuaranteedSweep(PID, liveHandsMap);
              return (
                <div className="mb-3 px-3 py-2 rounded-lg text-center w-full max-w-sm bg-gradient-to-r from-amber-900/80 to-yellow-900/80 border border-amber-400/60">
                  <div className="text-xs font-bold text-amber-300 tracking-wider mb-1">HATH BAND?</div>
                  <div className="text-[11px] sm:text-xs text-gray-200 mb-2">
                    Solo all-tricks call. Caller's partner is folded; no trump; win all 6 tricks for <span className="text-green-300 font-bold">+{HATH_BAND_WIN_POINTS}</span> or miss for a <span className="text-red-300 font-bold">+{HATH_BAND_FAIL_PENALTY}</span> swing toward opp.
                  </div>
                  <div className="flex justify-center gap-2">
                    <button
                      disabled={mySweepGuaranteed}
                      onClick={() => !mySweepGuaranteed && doHathBandCall(PID)}
                      title={mySweepGuaranteed ? 'Your hand guarantees a sweep — Hath Band requires at least 1% risk' : 'Call Hath Band — solo all 6 tricks, no trump, partner folded'}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs sm:text-sm transition-all active:scale-95 ${mySweepGuaranteed ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg cursor-pointer'}`}
                    >
                      {mySweepGuaranteed ? 'Blocked — Sweep Guaranteed' : `★ Call Hath Band`}
                    </button>
                    <button
                      onClick={() => dismissHathBandGate()}
                      className="px-3 py-1.5 rounded-lg font-bold text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 transition-all active:scale-95"
                    >
                      Start Play
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Trump Zone — actual card face-down / face-up */}
            {trump ? (
              trumpDown ? (
                <div className="mb-4"><CardC faceDown /><div className="text-center mt-1"><span className="text-emerald-200 text-xs font-bold">TRUMP SET</span></div></div>
              ) : (
                <div className="mb-4"><CardC card={trumpCard} highlighted /><div className="text-center mt-1"><span className="text-yellow-400 text-xs font-bold">TRUMP: {SUIT_SYMBOLS[trump]}</span></div></div>
              )
            ) : (
              <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl shadow-2xl mb-4 flex items-center justify-center bg-gradient-to-br from-emerald-700 to-teal-800 border-2 border-emerald-400">
                <span className="text-gray-400 text-xs">NO TRUMP</span>
              </div>
            )}

            {/* Team tricks & points during play */}
            {(status === 'PLAYING' || status === 'TRUMP_REVEALED' || status === 'ROUND_SCORED') && (() => {
              const redTricks = players.filter(p => p.team === 'RED').reduce((s, p) => s + p.tricksWon, 0);
              const blackTricks = players.filter(p => p.team === 'BLACK').reduce((s, p) => s + p.tricksWon, 0);
              const redPts = players.filter(p => p.team === 'RED').reduce((s, p) => s + p.pointsCaptured, 0);
              const blackPts = players.filter(p => p.team === 'BLACK').reduce((s, p) => s + p.pointsCaptured, 0);
              return (
                <div className="mb-2 w-full max-w-xs">
                  <div className="flex gap-4 justify-center text-xs font-bold">
                    <span className="text-red-400">RED ♥ {redPts}pts</span>
                    <span className="text-gray-300">BLACK ♠ {blackPts}pts</span>
                  </div>
                  <div className="flex gap-4 justify-center text-xs mt-1">
                    <span className="text-red-300">🏆 {redTricks} tricks</span>
                    <span className="text-gray-400">🏆 {blackTricks} tricks</span>
                  </div>
                </div>
              );
            })()}

            {/* Trick pile */}
            <div className="w-full h-32 sm:h-40 bg-black/20 rounded-xl border-2 border-dashed border-yellow-500/50 flex items-center justify-center relative mb-2 sm:mb-4">
              {pile.length > 0 ? (
                <div className="flex gap-1 sm:gap-2">
                  {pile.map((pc, i) => (
                    <div key={`${pc.playerId}-${i}`} className={`transform ${i===0?'-translate-x-2 sm:-translate-x-4 -rotate-6 sm:-rotate-12':i===1?'':i===2?'translate-x-2 sm:translate-x-4 rotate-6 sm:rotate-12':'translate-y-2 sm:translate-y-4 rotate-3 sm:rotate-6'}`}>
                      <CardC card={pc.card} small />
                    </div>
                  ))}
                </div>
              ) : <span className="text-gray-500 text-xs sm:text-sm">Trick pile empty</span>}
            </div>

            {/* Bidding / Trump Pick */}
            {status === 'BIDDING_PHASE1' && (
              <BidPanel cur={curBid} my={curBidder === PID} est={myHand.length > 0 ? evaluateHand(myHand).estimatedPoints : 0}
                thanniEligible={!!thanniEligible[PID]}
                thanniBlocked={thanniSweepGuaranteedForMe}
                onThanni={() => { if (curBidder === PID) doThanniBid(PID); }}
                onBid={(a) => { if (curBidder === PID) doBid(PID, a); }}
                onPass={() => { if (curBidder === PID) doPass(PID); }} />
            )}
            {roundMsg && (
              <div className="w-full bg-gray-800/70 rounded-lg p-3 text-center mb-2 border border-yellow-500/30">
                <span className="text-sm sm:text-base text-white">{roundMsg}</span>
              </div>
            )}
          </div>

          {/* Right (p1) */}
          <div className="flex-shrink-0 flex flex-col items-center w-16 sm:w-auto">
            <PlayerAvatar name={pName('p1')} team={gp('p1').team} active={turnPlayer === 'p1'} />
            <span className={`text-xs sm:text-sm font-semibold mt-1 whitespace-nowrap text-center ${turnPlayer === 'p1' ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>{pName('p1')}</span>
            <div className="sm:hidden mt-1"><CompactHand count={gh('p1').length} active={turnPlayer === 'p1'} /></div>
            <div className="hidden sm:block"><HandR cards={gh('p1')} label="" active={turnPlayer === 'p1'} fd={!debugMode} /></div>
            {status === 'BIDDING_PHASE1' && bidActions['p1'] && (
              <span className={`text-xs font-bold mt-1 px-2 py-0.5 rounded ${bidBadgeClass(bidActions['p1'])}`}>{bidActions['p1']}</span>
            )}
            {(status === 'PLAYING' || status === 'TRUMP_REVEALED') && gp('p1').tricksWon > 0 && (
              <span className="text-xs text-gray-300 mt-1">🏆 {gp('p1').tricksWon} · {gp('p1').pointsCaptured}pts</span>
            )}
          </div>
        </div>

        {/* Your hand — sticky bottom panel so cards are always visible without scrolling */}
        <div className="w-full sticky bottom-0 z-20 bg-gradient-to-t from-green-950 via-green-900/95 to-green-900/0 -mx-1 sm:mx-0 px-1 sm:px-0 pt-3 pb-3">
          <div className="w-full flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <PlayerAvatar name={pName(PID)} team="RED" active={isMy || showPick} />
              <span className={`text-xs sm:text-sm font-semibold text-center ${isMy || showPick ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>
              <span className="hidden sm:inline">{showPick ? `TAP A CARD — its suit becomes Trump (${myHand.length} cards)` : `YOUR HAND (${myHand.length} cards) ${isMy ? '— YOUR TURN' : ''}`}</span>
              <span className="sm:hidden">{showPick ? `Tap a card for Trump (${myHand.length})` : `Your Hand (${myHand.length}) ${isMy ? '— YOUR TURN' : ''}`}</span>
            </span>
          </div>
          <HandR cards={myHand}
            label=""
            hlSet={showPick ? new Set(myHand.map(c => c.id)) : legalIds}
            onClick={showPick ? (c: Card) => pickTrump(c) : userPlay}
            isMine active={isMy || showPick} />
          {status === 'BIDDING_PHASE1' && bidActions[PID] && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${bidBadgeClass(bidActions[PID])}`}>{bidActions[PID]}</span>
          )}
          {(status === 'PLAYING' || status === 'TRUMP_REVEALED') && gp(PID).tricksWon > 0 && (
            <span className="text-xs text-gray-300">🏆 {gp(PID).tricksWon} tricks · {gp(PID).pointsCaptured}pts</span>
          )}

          {/* Tricks Won Card — clickable to open all-tricks modal */}
          {(status === 'PLAYING' || status === 'TRUMP_REVEALED' || status === 'ROUND_SCORED') && (() => {
            const redTricks = results.filter(r => gp(r.winnerPlayerId).team === 'RED');
            const hasTricks = results.length > 0;
            return (
              <button
                onClick={() => hasTricks && setShowTricksModal(true)}
                className={`flex flex-col items-center justify-center w-14 h-20 sm:w-16 sm:h-24 rounded-lg shadow-lg border-2 transition-all ${hasTricks ? 'bg-gradient-to-br from-red-600 to-red-800 border-red-400 hover:scale-105 cursor-pointer active:scale-95' : 'bg-gray-700 border-gray-500 opacity-50 cursor-default'}`}
                aria-label="Review all tricks">
                <span className="text-white text-xl sm:text-2xl font-bold leading-none">{redTricks.length}</span>
                <span className="text-red-100 text-[10px] sm:text-xs font-bold mt-1">TRICKS</span>
              </button>
            );
          })()}

          <div className="flex flex-wrap justify-center gap-2 mt-2 w-full max-w-md">
            {status === 'MATCH_OVER' && (
              <button onClick={handleNewMatch}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
                New Match
              </button>
            )}
            {isMy && (status === 'PLAYING' || status === 'TRUMP_REVEALED') && (
              <span className="px-4 py-2 bg-yellow-600/50 text-yellow-200 text-xs font-bold rounded-lg animate-pulse">Your turn — play a card</span>
            )}
            {!isMy && (status === 'PLAYING' || status === 'TRUMP_REVEALED') && pile.length < 4 && turnPlayer && (
              <span className="px-4 py-2 bg-blue-600/50 text-blue-200 text-xs font-bold rounded-lg animate-pulse">AI playing...</span>
            )}
            {trump && !trumpOpen && (status === 'PLAYING' || status === 'TRUMP_REVEALED') && isMy && (
              <button onClick={revealTrump}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs sm:text-sm font-bold rounded-lg shadow transition-all active:scale-95">
                Reveal Trump
              </button>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Tricks Won Modal — shows ALL tricks with who won and points */}
      {showTricksModal && (() => {
        const allTricks = results;
        const redCount = allTricks.filter(r => gp(r.winnerPlayerId).team === 'RED').length;
        const blackCount = allTricks.length - redCount;
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowTricksModal(false)}>
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl border-2 border-yellow-500/50 max-w-2xl w-full max-h-[80vh] overflow-y-auto p-4 sm:p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-400 text-xl">🏆</span>
                  <h2 className="text-lg sm:text-xl font-bold text-white">All Tricks</h2>
                  <span className="bg-gray-700 text-white text-sm font-bold px-2 py-0.5 rounded-full">{allTricks.length}</span>
                  <span className="text-xs text-red-300 font-bold ml-1">RED {redCount}</span>
                  <span className="text-xs text-gray-300 font-bold">BLACK {blackCount}</span>
                </div>
                <button
                  onClick={() => setShowTricksModal(false)}
                  className="text-gray-400 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-all">
                  ×
                </button>
              </div>
              {allTricks.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No tricks played yet.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {allTricks.map((trick, i) => {
                    const tot = trick.playedCards.reduce((s, x) => s + x.card.pointValue, 0);
                    const winTeam = gp(trick.winnerPlayerId).team;
                    const borderCls = winTeam === 'RED' ? 'border-red-500/40' : 'border-gray-500/40';
                    const winnerCls = winTeam === 'RED' ? 'text-red-300' : 'text-gray-200';
                    return (
                      <div key={i} className={`bg-gray-700/50 rounded-xl p-3 border ${borderCls}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-bold text-sm ${winnerCls}`}>Trick {trick.playedCards[0]?.trickNumber ?? i + 1}</span>
                          <span className="text-yellow-400 text-sm font-bold">+{tot} pts</span>
                        </div>
                        <div className="text-xs text-gray-400 mb-2">Won by <span className={`font-bold ${winnerCls}`}>{pName(trick.winnerPlayerId)}</span> ({winTeam})</div>
                        <div className="flex gap-2 flex-wrap">
                          {trick.playedCards.map((pc, j) => (
                            <div key={j} className="flex flex-col items-center gap-0.5">
                              <CardC card={pc.card} small />
                              <span className={`text-[10px] ${pc.playerId === trick.winnerPlayerId ? 'text-yellow-400 font-bold' : 'text-gray-500'}`}>
                                {pName(pc.playerId)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-center mt-4 pt-3 border-t border-gray-600">
                <button
                  onClick={() => setShowTricksModal(false)}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Round Scored Modal — auto-opens after a regular round. Two actions: Review Tricks / Next Hand */}
      {showRoundScoredModal && status === 'ROUND_SCORED' && !thanniOutcome && !hathBandOutcome && (() => {
        const redTricks = results.filter(r => gp(r.winnerPlayerId).team === 'RED').length;
        const blackTricks = results.length - redTricks;
        const redPts = players.filter(p => p.team === 'RED').reduce((s, p) => s + p.pointsCaptured, 0);
        const blackPts = players.filter(p => p.team === 'BLACK').reduce((s, p) => s + p.pointsCaptured, 0);
        return (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl border-2 border-yellow-500/60 max-w-md w-full p-5 sm:p-6 text-center">
              <div className="text-4xl mb-2">🎯</div>
              <h2 className="text-2xl sm:text-3xl font-black text-yellow-400 mb-1">Round Complete</h2>
              <p className="text-xs text-gray-400 mb-4">{curBid ? `${getBidDisplayName(curBid.amount, curBid.kind)} by ${pName(bidWinner!)} (${gp(bidWinner!).team === 'RED' ? '♥ RED' : '♠ BLACK'})` : 'Hand complete'}</p>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-red-900/40 rounded-lg p-3 border border-red-500/30">
                  <div className="text-xs text-red-300 font-bold mb-1">♥ RED</div>
                  <div className="text-2xl font-black text-red-300">{redTricks} <span className="text-xs font-normal">tricks</span></div>
                  <div className="text-sm text-red-200">{redPts} pts</div>
                </div>
                <div className="bg-gray-700/60 rounded-lg p-3 border border-gray-500/40">
                  <div className="text-xs text-gray-300 font-bold mb-1">♠ BLACK</div>
                  <div className="text-2xl font-black text-gray-200">{blackTricks} <span className="text-xs font-normal">tricks</span></div>
                  <div className="text-sm text-gray-300">{blackPts} pts</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => setShowTricksModal(true)}
                  className="flex-1 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
                  📋 Review Tricks
                </button>
                <button
                  onClick={() => { setShowRoundScoredModal(false); deal(); }}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
                  ▶ Next Hand
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Void Round Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={handleVoidRedeal}>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl border-2 border-orange-500/50 max-w-md w-full p-5 sm:p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center mb-4">
              <span className="text-4xl">⚠️</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-orange-400 text-center mb-3">Round Void</h2>
            <p className="text-sm sm:text-base text-gray-300 text-center leading-relaxed mb-5">{voidReason}</p>
            <div className="flex justify-center">
              <button onClick={handleVoidRedeal}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
                Redeal Cards
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trump Selection Banner */}
      {showPick && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 pointer-events-none">
          <div className="bg-gradient-to-r from-amber-800 to-yellow-700 text-white px-6 py-3 rounded-xl shadow-2xl border-2 border-yellow-400 text-center">
            <div className="font-bold text-lg">YOU WON THE BID!</div>
            <div className="text-sm text-yellow-200">Click any card in your hand — its suit becomes Trump</div>
          </div>
        </div>
      )}

      {/* In-game Rules Modal (also reachable from header) */}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {/* Match Over Modal */}
      {status === 'MATCH_OVER' && (() => {
        const winner: Team = balance >= 0 ? 'RED' : 'BLACK';
        return (
          <MatchOverModal
            winner={winner}
            redPoints={redPts}
            blackPoints={blackPts}
            pName={pName}
            onNewMatch={handleNewMatch}
          />
        );
      })()}

      {/* Solo Bid (Thanni / Hath Band) Result Modal — shown after a solo round ends.
          Renders with happy/sad human + AI faces based on the user's perspective
          (PID is RED, so RED's success = user's success). */}
      {status === 'ROUND_SCORED' && (thanniOutcome || hathBandOutcome) && (() => {
        const isThanni = !!thanniOutcome;
        const outcome = isThanni ? thanniOutcome! : hathBandOutcome!;
        const callerId = isThanni ? bidWinner : hathBandCallerId;
        const tricksTaken = callerId ? gp(callerId).tricksWon : 0;
        const totalTricks = isThanni ? 4 : HATH_BAND_TRICK_COUNT;
        return (
          <SoloBidResultModal
            bidName={isThanni ? 'Thanni' : 'Hath Band'}
            outcome={outcome}
            tricksTaken={tricksTaken}
            totalTricks={totalTricks}
            winPoints={isThanni ? THANNI_WIN_POINTS : HATH_BAND_WIN_POINTS}
            failPenalty={isThanni ? THANNI_FAIL_PENALTY : HATH_BAND_FAIL_PENALTY}
            onNext={() => deal()}
            isMatchOver={false}
          />
        );
      })()}
    </div>
  );
}