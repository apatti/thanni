/**
 * ThanniGame.tsx — Complete React UI for the 24-Card Indian Card Game
 * @version 4.0.0 — Lobby screen, Rules modal, Card-pick for first dealer
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Bid, PlayedCard, Card, Suit, TrickResult,
  SUIT_SYMBOLS,
  buildDeck, shuffleDeck, getBidDisplayName,
  evaluateTrickWithContext, sortCards, getLegalCards,
  MATCH_GOAL,
  getNextPlayerClockwise,
} from './thanniEngine';
import { evaluateHand, aiPickCard, computeNextDealer } from './thanniAI';

// ─── Types ────────────────────────────────────────────────────────────
type GameStatus =
  | 'LOBBY' | 'BIDDING_PHASE1' | 'BIDDING_PHASE2'
  | 'TRUMP_SET' | 'PLAYING' | 'TRUMP_REVEALED'
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
    <div className={`w-full max-w-md mx-auto px-3 sm:px-4 mb-3 bg-gradient-to-r ${bgGlow} rounded-xl border p-3 sm:p-4 shadow-lg transition-all duration-500`}>
      {/* Top row: team scores */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-red-400 text-lg">♥</span>
          <span className={`font-bold text-lg sm:text-xl ${red.points > black.points ? 'text-red-400' : 'text-red-400/60'}`}>{red.points}</span>
          <span className="text-xs text-gray-500">{red.isFaceUp ? '▲' : '▼'}</span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-yellow-500 text-xs bg-yellow-900/50 px-2 py-0.5 rounded-full mb-1">Goal: {MATCH_GOAL}</span>
          <span className={`text-2xl sm:text-3xl font-black ${scoreColor} transition-colors duration-500`}>
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

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">{black.isFaceUp ? '▲' : '▼'}</span>
          <span className={`font-bold text-lg sm:text-xl ${black.points > red.points ? 'text-gray-200' : 'text-gray-200/60'}`}>{black.points}</span>
          <span className="text-gray-300 text-lg">♠</span>
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

// ─── Bidding Panel ────────────────────────────────────────────────────
function BidPanel({ cur, my, est, onBid, onPass }: {
  cur: Bid | null; my: boolean; est: number; onBid: (n: number) => void; onPass: () => void;
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

  return (
    <div className="w-full max-w-lg mx-auto bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-3 sm:p-4 shadow-2xl border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white font-bold text-sm sm:text-base">BIDDING ROUND</h3>
        <span className="text-xs text-yellow-400">Est: ~{est}pts</span>
      </div>
      <div className="bg-gray-700/50 rounded-lg p-2 mb-3 text-center">
        <span className="text-xs text-gray-400 mr-1">Current Bid:</span>
        <span className="text-sm sm:text-base font-bold text-yellow-400">
          {cur ? `${getBidDisplayName(cur.amount)} (${cur.amount})` : 'None'}
        </span>
      </div>
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
function RulesModal({ onClose }: { onClose: () => void }): ReactNode {
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h3 className="text-yellow-400 font-bold text-sm sm:text-base mb-1">{title}</h3>
      <div className="text-gray-300 text-xs sm:text-sm leading-relaxed space-y-1">{children}</div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl border-2 border-yellow-500/50 max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 sm:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-gradient-to-br from-gray-800 to-gray-900 -mx-5 sm:-mx-6 px-5 sm:px-6 pb-3 border-b border-gray-700 z-10">
          <h2 className="text-xl sm:text-2xl font-bold text-yellow-400">How to Play Thanni</h2>
          <button onClick={onClose} aria-label="Close"
            className="text-gray-400 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-all">×</button>
        </div>
        <div className="space-y-5">
          <Section title="Players & Teams">
            <p>• 4 players form 2 fixed teams: <strong className="text-red-400">RED</strong> (You + Arjun, North/South seats) vs <strong className="text-gray-200">BLACK</strong> (Vikram + Priya, East/West seats).</p>
            <p>• Teammates sit across from each other. The seat that deals rotates based on who is trailing.</p>
          </Section>
          <Section title="The Deck & Point Values">
            <p>• 24-card deck: 4 suits (♥ ♦ ♠ ♣) × 6 values: A, K, Q, J, 10, 9.</p>
            <p>• <strong>Point values:</strong> J = 30 · 9 = 20 · A = 11 · 10 = 10 · K = 6 · Q = 5.</p>
            <p>• Total points in play each round: <strong>328</strong>.</p>
          </Section>
          <Section title="Round Flow">
            <p>1. Dealer deals <strong>4 cards</strong> to each player (16 of 24 cards).</p>
            <p>2. Bidding phase: players bid on how many points their team commits to win.</p>
            <p>3. Highest bidder picks the <strong>Trump suit</strong> by selecting a card from their hand and placing it face-down.</p>
            <p>4. Remaining <strong>2 cards</strong> are dealt (now 6 cards each).</p>
            <p>5. Six tricks are played — player to the left of dealer leads trick #1. Trick winner leads the next.</p>
            <p>6. After 6 tricks, round is scored and match points are applied.</p>
            <p>7. First team to reach <strong>12 match points</strong> wins the match.</p>
          </Section>
          <Section title="Bidding">
            <p>• <strong>Beat (150)</strong> is the minimum bid. If all 4 players pass, the first bidder is forced to bid Beat.</p>
            <p>• Bids go up in 10s: 150 → 160 ("60") → 170 ("70") → 200 ("John") → 210 ("John 10") → 220 ("John 20") → up to 328.</p>
            <p>• Bidding ends when 3 players pass after someone has bid. That bidder's team wins the contract.</p>
            <p>• You can only bid higher than the current highest bid.</p>
          </Section>
          <Section title="Trick Play">
            <p>• You <strong>must follow the led suit</strong> if you have a card of that suit.</p>
            <p>• If you cannot follow suit, you may either play any card or request the <strong>Trump Reveal</strong>.</p>
            <p>• Trick winner = highest card of the led suit, unless a trump was played (then highest trump wins).</p>
          </Section>
          <Section title="Trump Reveal (special mechanic)">
            <p>• The trump card remains <strong>face-down</strong> at the start of the round — its suit is hidden from everyone.</p>
            <p>• Once per round, a player who cannot follow suit may request the reveal: the card turns face-up and is <strong>returned to the bid winner's hand</strong>.</p>
            <p>• The player who requested the reveal <strong>MUST play a trump</strong> if they have one after the reveal.</p>
            <p>• After a reveal, the trump suit is public knowledge for the rest of the round.</p>
          </Section>
          <Section title="Scoring (Match Points)">
            <p>• <strong>Standard bid (Beat, 60, 70 — below 200):</strong></p>
            <p>  – Team <strong>makes</strong> their bid: +1 match point (or opponent −1 if scoring card face-down).</p>
            <p>  – Team <strong>misses</strong>: opponent gets +2 (or bidding team −2 if face-down).</p>
            <p>• <strong>High-value bid (John / John 10 / John 20 — 200+):</strong></p>
            <p>  – Team <strong>makes</strong> their bid: +2 match points (or opponent −2 if face-down).</p>
            <p>  – Team <strong>misses</strong>: opponent gets +4 (or bidding team −4 if face-down).</p>
          </Section>
          <Section title="Scoreboard — 6-Card Deck">
            <p>• Each team has a virtual 6-card scoreboard, all face-down at the start.</p>
            <p>• The first team to score flips their scoring card <strong>face-up</strong>.</p>
            <p>• Dealer rotation: the team whose card is still face-down keeps dealing until they score and flip theirs.</p>
            <p>• Once both teams have face-up cards, the dealer rotates clockwise each round.</p>
          </Section>
          <Section title="Winning">
            <p>• The first team to reach <strong>12 match points</strong> wins the match.</p>
            <p>• Tap the trophy card next to your hand to review tricks your team has won this round.</p>
          </Section>
        </div>
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
function LobbyScreen({ onStart, onShowRules, playerName, setPlayerName }: {
  onStart: () => void; onShowRules: () => void;
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

        <div className="grid grid-cols-2 gap-3 mb-5">
          <button onClick={onStart} disabled={!playerName.trim()}
            className={`px-4 py-3 font-bold rounded-lg shadow transition-all active:scale-95 ${playerName.trim() ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
            New Game
          </button>
          <button onClick={onShowRules}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow transition-all active:scale-95">
            How to Play
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
  const [playerName, setPlayerNameState] = useState('You');
  const playerNameRef = useRef('You');
  const [showRules, setShowRules] = useState(false);
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

  // Scores — persist across rounds
  const [redS, setRedS] = useState({ points: 0, isFaceUp: false });
  const [blackS, setBlackS] = useState({ points: 0, isFaceUp: false });

  // UI
  const [msg, setMsg] = useState('Welcome to Thanni!');
  const [roundMsg, setRoundMsg] = useState<string | null>(null);
  const [showTricksModal, setShowTricksModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState<string>('');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deckRef = useRef<Card[]>([]);
  const passesRef = useRef(0);
  const curBidRef = useRef<Bid | null>(null);
  const voidCheckRef = useRef(false);

  // ── Player name setter (synchronously updates ref + state)
  const setPlayerName = useCallback((name: string) => {
    const v = name || 'You';
    setPlayerNameState(v);
    playerNameRef.current = v;
  }, []);

  // ── pName helper — uses ref so callbacks don't need to depend on player name
  const pName = useCallback((pid: string): string => {
    if (pid === PID) return playerNameRef.current;
    return BOT_NAMES[pid] ?? pid;
  }, []);

  // ── Create initial players using current player name from ref
  const getInitPlayers = useCallback((): PlayerState[] => [
    mkPlayer('p0', 'Arjun', 'RED', 'p2'),
    mkPlayer('p1', 'Vikram', 'BLACK', 'p3'),
    mkPlayer('p2', playerNameRef.current, 'RED', 'p0', true),
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

  const legalFor = useCallback((pid: string) =>
    getLegalCards(gh(pid), pile, trump, trumpOpen, pid, trumpRevealedBy),
    [gh, pile, trump, trumpOpen, trumpRevealedBy]);

  // ─── LOBBY / CARD-PICK HANDLERS ───
  const handleStartGame = useCallback(() => {
    if (!playerNameRef.current.trim()) return;
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
    setRedS({ points: 0, isFaceUp: false });
    setBlackS({ points: 0, isFaceUp: false });
    setStatus('LOBBY');
    setGameStarted(false);
    setCardPickPhase('IDLE');
    setPickedCard(null);
    setPickCards([]);
    setCurBid(null); curBidRef.current = null;
    setBidWinner(null); setBidLog([]); setBidActions({});
    setTrump(null); setTrumpCard(null); setTrumpDown(true); setTrumpOpen(false);
    setShowPick(false); setTrumpRevealedBy(null);
    setTrickNum(0); setTurnPlayer(null); setPile([]); setResults([]);
    setRoundMsg(null); setShowVoidModal(false); setVoidReason(''); voidCheckRef.current = false;
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
    setTrump(null); setTrumpCard(null); setTrumpDown(true); setTrumpOpen(false); setShowPick(false); setTrumpRevealedBy(null);
    setTrickNum(0); setTurnPlayer(null); setPile([]); setResults([]); setRoundMsg(null);
    voidCheckRef.current = false; setShowVoidModal(false); setVoidReason('');
    setMsg(`Cards dealt (4 each). ${pName(fb)} bids first.`);
  }, [clr, dealerId, pName, getInitPlayers]);

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
    const b: Bid = { amount: amt, playerId: pid, displayName: getBidDisplayName(amt), timestamp: Date.now() };
    setCurBid(b); curBidRef.current = b;
    setPasses(0); passesRef.current = 0;
    setBidLog(prev => [...prev, `${pName(pid)} bids ${getBidDisplayName(amt)} (${amt})`]);
    setBidActions(prev => ({ ...prev, [pid]: `${getBidDisplayName(amt)} (${amt})` }));
    setMsg(`${pName(pid)} bids ${getBidDisplayName(amt)}`);
    setCurBidder(getNextPlayerClockwise(pid));
  }, [pName]);

  const doPass = useCallback((pid: string) => {
    const np = passesRef.current + 1;
    passesRef.current = np;
    setPasses(np);
    setBidLog(prev => [...prev, `${pName(pid)} passes`]);
    setBidActions(prev => ({ ...prev, [pid]: 'PASS' }));
    setMsg(`${pName(pid)} passes.`);

    const cb = curBidRef.current;
    if (!cb && np >= 4) {
      const fp = getNextPlayerClockwise(dealerId);
      const fb: Bid = { amount: 150, playerId: fp, displayName: 'Beat', timestamp: Date.now() };
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
  }, [dealerId, pName]);

  // AI bidding effect — scale 4-card hand eval to estimate 6-card strength
  useEffect(() => {
    if (status !== 'BIDDING_PHASE1' || curBidder === PID || bidWinner) return;
    const t = setTimeout(() => {
      const hand = gh(curBidder);
      const cb = curBidRef.current;
      const eval4 = evaluateHand(hand);
      const projectedPoints = Math.round(eval4.adjustedScore * 1.5);
      const minA = cb ? cb.amount + 10 : 150;
      if (projectedPoints >= minA && minA <= 328) {
        const bidAmt = Math.max(minA, Math.ceil(projectedPoints / 10) * 10);
        bidAmt <= 328 ? doBid(curBidder, Math.min(bidAmt, 328)) : doPass(curBidder);
      } else {
        doPass(curBidder);
      }
    }, 800 + Math.random() * 700);
    return () => clearTimeout(t);
  }, [status, curBidder, curBid, bidWinner, gh, doBid, doPass]);

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
          return cur.map(p => p.id === bidWinner ? { ...p, hand: p.hand.filter(c => c.id !== chosenCard.id) } : p);
        });
      }, 1000);
      return () => clearTimeout(t1);
    }
  }, [status, bidWinner, showPick, pName]);

  // TRUMP_SET → deal remaining 2 cards → PLAYING
  useEffect(() => {
    if (status !== 'TRUMP_SET') return;
    deal2();
    const t = setTimeout(() => {
      // Void round: opposition has no trump cards → show modal & redeal
      if (voidCheckRef.current) {
        const bidTeam = (bidWinner === 'p0' || bidWinner === 'p2') ? 'RED' : 'BLACK';
        const oppTeam = bidTeam === 'RED' ? 'BLACK' : 'RED';
        const oppIds: string[] = bidTeam === 'RED' ? ['p1', 'p3'] : ['p0', 'p2'];
        const oppNames = oppIds.map(id => pName(id)).join(' & ');
        setVoidReason(`The opposition (${oppNames} — ${oppTeam}) has no ${SUIT_SYMBOLS[trump!]} trump cards. The round is void and must be redealt.`);
        setShowVoidModal(true);
        setMsg('Round voided — opposition has no trump suit. Redealing...');
        return;
      }
      setStatus('PLAYING');
      const ld = getNextPlayerClockwise(dealerId);
      setTrickNum(1); setTurnPlayer(ld);
      setMsg(`Trick 1. ${pName(ld)} leads.`);
    }, 2000);
    return () => clearTimeout(t);
  }, [status, dealerId, deal2, pName, bidWinner, trump]);

  const pickTrump = useCallback((card: Card) => {
    setTrump(card.suit); setTrumpCard(card); setTrumpDown(true); setShowPick(false); setStatus('TRUMP_SET');
    setPlayers(prev => prev.map(p => p.id === PID ? { ...p, hand: p.hand.filter(c => c.id !== card.id) } : p));
    setMsg(`Trump set to ${SUIT_SYMBOLS[card.suit]}. Card placed face-down!`);
  }, []);

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
  }, [trump, trumpOpen, trumpCard, bidWinner]);

  const revealTrump = useCallback(() => {
    if (!trump || trumpOpen) return;
    doRevealTrump(PID);
  }, [doRevealTrump, trump, trumpOpen]);

  // ─── SCORE ROUND ───
  const scoreRound = useCallback((res: TrickResult[]) => {
    if (!bidWinner || !curBid) return;
    let rp = 0, bp = 0;
    for (const t of res) {
      const tot = t.playedCards.reduce((s, x) => s + x.card.pointValue, 0);
      gp(t.winnerPlayerId).team === 'RED' ? (rp += tot) : (bp += tot);
    }
    const bt = gp(bidWinner).team;
    const btp = bt === 'RED' ? rp : bp;
    const met = btp >= curBid.amount;
    const hv = curBid.amount >= 200;
    const mm = hv ? 2 : 1, fm = hv ? 4 : 2;
    let rc = 0, bc = 0;
    if (met) {
      if (bt === 'RED') rc = mm; else bc = mm;
    } else {
      if (bt === 'RED') bc = fm; else rc = fm;
    }
    const nrp = Math.max(0, redS.points + rc), nbp = Math.max(0, blackS.points + bc);
    const nrf = redS.isFaceUp || rc > 0, nbf = blackS.isFaceUp || bc > 0;
    setRedS({ points: nrp, isFaceUp: nrf });
    setBlackS({ points: nbp, isFaceUp: nbf });

    const rm = `${bt} ${met ? 'made' : 'missed'} ${getBidDisplayName(curBid.amount)}. Red ${rp}pts, Black ${bp}pts. Match: Red ${nrp}, Black ${nbp}.`;
    setRoundMsg(rm); setMsg(rm);

    if (nrp >= MATCH_GOAL) { setStatus('MATCH_OVER'); setMsg(`🔴 ${pName('p0')}/${pName('p2')} WIN! ${nrp}-${nbp}`); }
    else if (nbp >= MATCH_GOAL) { setStatus('MATCH_OVER'); setMsg(`⚫ ${pName('p1')}/${pName('p3')} WIN! ${nbp}-${nrp}`); }
    else {
      setStatus('ROUND_SCORED');
      setDealerId(computeNextDealer(dealerId, nrp, nbp, players));
    }
  }, [bidWinner, curBid, gp, redS, blackS, dealerId, players, pName]);

  // ─── PLAY A CARD ───
  const playCard = useCallback((pid: string, card: Card) => {
    setHand(pid, gh(pid).filter(c => c.id !== card.id));
    const pc: PlayedCard = { card, playerId: pid, trickNumber: trickNum, positionInTrick: pile.length + 1 };
    const np = [...pile, pc];
    setPile(np);
    if (pid !== PID) setMsg(`${pName(pid)} plays ${card.value}${SUIT_SYMBOLS[card.suit]}`);

    if (np.length === 4) {
      setTimeout(() => {
        const res = evaluateTrickWithContext(np, trumpOpen ? trump : null);
        const tot = np.reduce((s, x) => s + x.card.pointValue, 0);
        addStats(res.winnerPlayerId, 1, tot);
        const nr = [...results, res];
        setResults(nr);
        setMsg(`${pName(res.winnerPlayerId)} wins trick ${trickNum} (+${tot}pts)!`);
        setTimeout(() => {
          setPile([]);
          if (trickNum < 6) {
            setTrickNum(n => n + 1);
            setTurnPlayer(res.winnerPlayerId);
            setMsg(`Trick ${trickNum + 1}. ${pName(res.winnerPlayerId)} leads.`);
          } else scoreRound(nr);
        }, 1500);
      }, 800);
    } else {
      const next = getNextPlayerClockwise(pid);
      setTurnPlayer(next);
      if (next === PID) setMsg('Your turn — play a card.');
    }
  }, [setHand, gh, trickNum, pile, trump, trumpOpen, results, addStats, scoreRound, pName]);

  const userPlay = useCallback((card: Card) => {
    if (turnPlayer !== PID || (status !== 'PLAYING' && status !== 'TRUMP_REVEALED')) return;
    const legal = legalFor(PID);
    if (!legal.some(c => c.id === card.id)) { setMsg('Cannot play that card — follow suit!'); return; }
    playCard(PID, card);
  }, [turnPlayer, status, legalFor, playCard]);

  // AI trump-reveal effect
  useEffect(() => {
    if (status !== 'PLAYING' || trumpOpen || !trump || pile.length === 0) return;
    if (!turnPlayer || turnPlayer === PID) return;
    const hand = gh(turnPlayer);
    const ledSuit = pile[0].card.suit;
    const canFollow = hand.some(c => c.suit === ledSuit);
    if (canFollow) return;
    const t = setTimeout(() => doRevealTrump(turnPlayer), 500 + Math.random() * 400);
    return () => clearTimeout(t);
  }, [status, turnPlayer, pile.length, trumpOpen, trump, gh, pile, doRevealTrump]);

  // AI trick play
  useEffect(() => {
    if (status !== 'PLAYING' && status !== 'TRUMP_REVEALED') return;
    if (!turnPlayer || turnPlayer === PID || pile.length >= 4) return;
    const t = setTimeout(() => {
      const hand = gh(turnPlayer);
      if (!hand.length) return;
      const legal = legalFor(turnPlayer);
      if (!legal.length) return;
      const me = gp(turnPlayer);
      const pick = aiPickCard(legal, pile, turnPlayer, me.partnerId, trumpOpen, trump);
      playCard(turnPlayer, pick);
    }, 600 + Math.random() * 800);
    return () => clearTimeout(t);
  }, [status, turnPlayer, pile.length, gh, legalFor, playCard, trump, trumpOpen, gp]);

  const legalIds = (status === 'PLAYING' || status === 'TRUMP_REVEALED') && isMy
    ? new Set(legalFor(PID).map(c => c.id)) : undefined;

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
    <div className="min-h-screen bg-gradient-to-b from-green-900 via-green-800 to-emerald-900 flex flex-col items-center p-2 sm:p-4 overflow-auto pb-8">
      {/* Header */}
      <div className="w-full max-w-4xl mx-auto mb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-yellow-400 drop-shadow-lg">THANNI</h1>
          <button onClick={() => setShowRules(true)}
            className="text-xs sm:text-sm text-blue-300 hover:text-blue-200 underline">Rules</button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-1 text-xs sm:text-sm text-gray-300 flex-wrap">
          <span>Status: <strong className="text-yellow-300">{status}</strong></span>
          {trump && !trumpDown && <span className="text-red-400 font-bold">Trump: {SUIT_SYMBOLS[trump]}</span>}
          <span>Trick: {trickNum}/6</span>
          <span>Dealer: {pName(dealerId)}</span>
        </div>
      </div>

      <ScoreBoard red={redS} black={blackS} />

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

      {/* GAME TABLE */}
      <div className="w-full max-w-4xl flex flex-col items-center justify-center flex-1 relative mt-2">
        {/* Top (p0 = Partner) */}
        <div className="w-full flex justify-center mb-2">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-1">
              <PlayerAvatar name={pName('p0')} team={gp('p0').team} active={turnPlayer === 'p0'} />
              <span className={`text-xs font-semibold ${turnPlayer === 'p0' ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>{pName('p0')} — {gh('p0').length} cards</span>
            </div>
            <HandR cards={gh('p0')} label="" active={turnPlayer === 'p0'} fd />
            {status === 'BIDDING_PHASE1' && bidActions['p0'] && (
              <span className={`text-xs font-bold mt-1 px-2 py-0.5 rounded ${bidActions['p0'] === 'PASS' ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>{bidActions['p0']}</span>
            )}
            {(status === 'PLAYING' || status === 'TRUMP_REVEALED') && gp('p0').tricksWon > 0 && (
              <span className="text-xs text-gray-300 mt-1">🏆 {gp('p0').tricksWon} tricks · {gp('p0').pointsCaptured}pts</span>
            )}
          </div>
        </div>

        <div className="w-full flex items-center justify-center gap-2 sm:gap-4 flex-1">
          {/* Left (p3) */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <PlayerAvatar name={pName('p3')} team={gp('p3').team} active={turnPlayer === 'p3'} />
            <span className={`text-xs font-semibold mt-1 ${turnPlayer === 'p3' ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>{pName('p3')} — {gh('p3').length}</span>
            <HandR cards={gh('p3')} label="" active={turnPlayer === 'p3'} fd />
            {status === 'BIDDING_PHASE1' && bidActions['p3'] && (
              <span className={`text-xs font-bold mt-1 px-2 py-0.5 rounded ${bidActions['p3'] === 'PASS' ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>{bidActions['p3']}</span>
            )}
            {(status === 'PLAYING' || status === 'TRUMP_REVEALED') && gp('p3').tricksWon > 0 && (
              <span className="text-xs text-gray-300 mt-1">🏆 {gp('p3').tricksWon} · {gp('p3').pointsCaptured}pts</span>
            )}
          </div>

          {/* Center */}
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm sm:max-w-md">
            {/* Winning Bid info (during play + scoring) */}
            {curBid && bidWinner && (status === 'PLAYING' || status === 'TRUMP_REVEALED' || status === 'ROUND_SCORED') && (() => {
              const bidTeam = gp(bidWinner).team;
              const partnerName = pName(gp(bidWinner).partnerId);
              return (
                <div className="mb-3 px-3 py-1.5 bg-gray-900/60 rounded-lg border border-yellow-500/40 text-center w-full max-w-xs">
                  <div className="text-xs text-gray-400">Winning Bid</div>
                  <div className={`text-sm font-bold ${bidTeam === 'RED' ? 'text-red-400' : 'text-gray-200'}`}>
                    {getBidDisplayName(curBid.amount)} ({curBid.amount}) — {bidTeam === 'RED' ? '♥ RED' : '♠ BLACK'}
                  </div>
                  <div className="text-xs text-gray-400">
                    by {pName(bidWinner)} & {partnerName}
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
            <div className="w-full h-32 sm:h-40 bg-black/20 rounded-xl border-2 border-dashed border-yellow-500/50 flex items-center justify-center relative mb-4">
              {pile.length > 0 ? (
                <div className="flex gap-1 sm:gap-2">
                  {pile.map((pc, i) => (
                    <div key={`${pc.playerId}-${i}`} className={`transform ${i===0?'-translate-x-4 -rotate-12':i===1?'':i===2?'translate-x-4 rotate-12':'translate-y-4 rotate-6'}`}>
                      <CardC card={pc.card} small />
                    </div>
                  ))}
                </div>
              ) : <span className="text-gray-500 text-xs sm:text-sm">Trick pile empty</span>}
            </div>

            {/* Bidding / Trump Pick */}
            {status === 'BIDDING_PHASE1' && (
              <BidPanel cur={curBid} my={curBidder === PID} est={myHand.length > 0 ? evaluateHand(myHand).estimatedPoints : 0}
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
          <div className="flex-shrink-0 flex flex-col items-center">
            <PlayerAvatar name={pName('p1')} team={gp('p1').team} active={turnPlayer === 'p1'} />
            <span className={`text-xs font-semibold mt-1 ${turnPlayer === 'p1' ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>{pName('p1')} — {gh('p1').length}</span>
            <HandR cards={gh('p1')} label="" active={turnPlayer === 'p1'} fd />
            {status === 'BIDDING_PHASE1' && bidActions['p1'] && (
              <span className={`text-xs font-bold mt-1 px-2 py-0.5 rounded ${bidActions['p1'] === 'PASS' ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>{bidActions['p1']}</span>
            )}
            {(status === 'PLAYING' || status === 'TRUMP_REVEALED') && gp('p1').tricksWon > 0 && (
              <span className="text-xs text-gray-300 mt-1">🏆 {gp('p1').tricksWon} · {gp('p1').pointsCaptured}pts</span>
            )}
          </div>
        </div>

        {/* Your hand */}
        <div className="w-full flex flex-col items-center gap-2 mt-4">
          <div className="flex items-center gap-2">
            <PlayerAvatar name={pName(PID)} team="RED" active={isMy || showPick} />
            <span className={`text-xs font-semibold ${isMy || showPick ? 'text-yellow-400 animate-pulse' : 'text-gray-400'}`}>
              {showPick ? `TAP A CARD — its suit becomes Trump (${myHand.length} cards)` : `YOUR HAND (${myHand.length} cards) ${isMy ? '— YOUR TURN' : ''}`}
            </span>
          </div>
          <HandR cards={myHand}
            label=""
            hlSet={showPick ? new Set(myHand.map(c => c.id)) : legalIds}
            onClick={showPick ? (c: Card) => pickTrump(c) : userPlay}
            isMine active={isMy || showPick} />
          {status === 'BIDDING_PHASE1' && bidActions[PID] && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${bidActions[PID] === 'PASS' ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>{bidActions[PID]}</span>
          )}
          {(status === 'PLAYING' || status === 'TRUMP_REVEALED') && gp(PID).tricksWon > 0 && (
            <span className="text-xs text-gray-300">🏆 {gp(PID).tricksWon} tricks · {gp(PID).pointsCaptured}pts</span>
          )}

          {/* Tricks Won Card — clickable to open modal */}
          {(status === 'PLAYING' || status === 'TRUMP_REVEALED' || status === 'ROUND_SCORED') && (() => {
            const redTricks = results.filter(r => gp(r.winnerPlayerId).team === 'RED');
            return (
              <button
                onClick={() => redTricks.length > 0 && setShowTricksModal(true)}
                className={`flex flex-col items-center justify-center w-14 h-20 sm:w-16 sm:h-24 rounded-lg shadow-lg border-2 transition-all ${redTricks.length > 0 ? 'bg-gradient-to-br from-red-600 to-red-800 border-red-400 hover:scale-105 cursor-pointer active:scale-95' : 'bg-gray-700 border-gray-500 opacity-50 cursor-default'}`}
                aria-label="Tricks won by your team">
                <span className="text-white text-xl sm:text-2xl font-bold leading-none">{redTricks.length}</span>
                <span className="text-red-100 text-[10px] sm:text-xs font-bold mt-1">TRICKS</span>
              </button>
            );
          })()}

          <div className="flex flex-wrap justify-center gap-2 mt-2 w-full max-w-md">
            {status === 'ROUND_SCORED' && (
              <button onClick={() => deal()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
                Next Hand
              </button>
            )}
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

      {/* Footer */}
      <div className="w-full max-w-2xl mx-auto py-3 flex justify-center gap-3 flex-wrap border-t border-gray-700 mt-4 pt-3">
        {status === 'ROUND_SCORED' && (
          <button onClick={() => deal()}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
            Next Hand
          </button>
        )}
        {status === 'MATCH_OVER' && (
          <button onClick={handleNewMatch}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
            New Match
          </button>
        )}
      </div>

      {/* Tricks Won Modal */}
      {showTricksModal && (() => {
        const redTricks = results.filter(r => gp(r.winnerPlayerId).team === 'RED');
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowTricksModal(false)}>
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl border-2 border-red-500/50 max-w-2xl w-full max-h-[80vh] overflow-y-auto p-4 sm:p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-red-400 text-xl">♥</span>
                  <h2 className="text-lg sm:text-xl font-bold text-white">Your Team Tricks</h2>
                  <span className="bg-red-600 text-white text-sm font-bold px-2 py-0.5 rounded-full">{redTricks.length}</span>
                </div>
                <button
                  onClick={() => setShowTricksModal(false)}
                  className="text-gray-400 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-all">
                  ×
                </button>
              </div>
              {redTricks.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No tricks won yet. Keep playing!</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {redTricks.map((trick, i) => {
                    const tot = trick.playedCards.reduce((s, x) => s + x.card.pointValue, 0);
                    return (
                      <div key={i} className="bg-gray-700/50 rounded-xl p-3 border border-red-500/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-red-300 font-bold text-sm">Trick {trick.playedCards[0]?.trickNumber ?? i + 1}</span>
                          <span className="text-yellow-400 text-sm font-bold">+{tot} pts</span>
                        </div>
                        <div className="text-xs text-gray-400 mb-2">Won by {pName(trick.winnerPlayerId)}</div>
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
                  className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95">
                  Close
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
        const winner: Team = redS.points >= blackS.points ? 'RED' : 'BLACK';
        return (
          <MatchOverModal
            winner={winner}
            redPoints={redS.points}
            blackPoints={blackS.points}
            pName={pName}
            onNewMatch={handleNewMatch}
          />
        );
      })()}
    </div>
  );
}