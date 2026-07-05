import { useState, type ReactNode } from 'react';

// ─── Slide data ───────────────────────────────────────────────────────
interface Slide {
  title: string;
  content: ReactNode;
}

const slides: Slide[] = [
  // Slide 1 — Welcome
  {
    title: 'Welcome to Thanni! 🃏',
    content: (
      <div className="space-y-4 text-center">
        <p className="text-gray-300 text-sm sm:text-base">
          A traditional Indian <strong className="text-yellow-300">24-card</strong> bidding &amp; trick-taking card game.
        </p>
        <div className="bg-gray-800/60 rounded-xl p-4 inline-block">
          <div className="text-3xl mb-2">🂡 🂱 🃁 🃑</div>
          <p className="text-xs text-gray-400">Only 24 cards · 4 players · 2 teams</p>
        </div>
        <p className="text-gray-400 text-xs sm:text-sm">
          Don't worry — it's simpler than it looks!<br />
          Let's walk through the basics in <strong className="text-white">7 quick slides</strong>.
        </p>
      </div>
    ),
  },

  // Slide 2 — Teams
  {
    title: 'Teams & Seating',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300 text-sm text-center">You're always on <strong className="text-red-400">Red Team</strong> with your partner.</p>
        <div className="flex justify-center">
          <div className="grid grid-cols-3 grid-rows-3 gap-2 w-56 sm:w-64">
            {/* North */}
            <div className="col-start-2 flex justify-center">
              <div className="px-3 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-700 text-white text-xs font-bold text-center shadow">
                Arjun<br /><span className="text-[10px] opacity-80">Partner</span>
              </div>
            </div>
            {/* West */}
            <div className="row-start-2 flex items-center justify-center">
              <div className="px-3 py-2 rounded-lg bg-gradient-to-br from-gray-600 to-gray-800 text-white text-xs font-bold text-center shadow">
                Priya<br /><span className="text-[10px] opacity-80">Opponent</span>
              </div>
            </div>
            {/* Center */}
            <div className="row-start-2 col-start-2 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-emerald-800 border-2 border-emerald-500 flex items-center justify-center text-emerald-300 text-lg">🃏</div>
            </div>
            {/* East */}
            <div className="row-start-2 col-start-3 flex items-center justify-center">
              <div className="px-3 py-2 rounded-lg bg-gradient-to-br from-gray-600 to-gray-800 text-white text-xs font-bold text-center shadow">
                Vikram<br /><span className="text-[10px] opacity-80">Opponent</span>
              </div>
            </div>
            {/* South */}
            <div className="col-start-2 row-start-3 flex justify-center">
              <div className="px-3 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-700 text-white text-xs font-bold text-center shadow ring-2 ring-yellow-400">
                You<br /><span className="text-[10px] opacity-80">South</span>
              </div>
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-gray-500">
          🔴 <strong className="text-red-400">Red</strong> = You + Arjun &nbsp;·&nbsp; ⚫ <strong className="text-gray-300">Black</strong> = Vikram + Priya
        </p>
      </div>
    ),
  },

  // Slide 3 — Card Values
  {
    title: 'Card Values — Surprise! 😲',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300 text-sm text-center">These aren't normal rankings. <strong className="text-yellow-300">J and 9 are the power cards!</strong></p>
        <div className="flex justify-center">
          <table className="text-center border-collapse">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="px-3 py-1.5">Card</th>
                <th className="px-3 py-1.5">Points</th>
                <th className="px-3 py-1.5">Rank</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="bg-yellow-500/20">
                <td className="px-3 py-1.5 font-bold text-yellow-300">J</td>
                <td className="px-3 py-1.5 font-bold text-yellow-300">30</td>
                <td className="px-3 py-1.5 text-yellow-300">👑 Highest</td>
              </tr>
              <tr className="bg-orange-500/15">
                <td className="px-3 py-1.5 font-bold text-orange-300">9</td>
                <td className="px-3 py-1.5 font-bold text-orange-300">20</td>
                <td className="px-3 py-1.5 text-orange-300">2nd</td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 text-gray-300">A</td>
                <td className="px-3 py-1.5 text-gray-300">11</td>
                <td className="px-3 py-1.5 text-gray-400">3rd</td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 text-gray-300">10</td>
                <td className="px-3 py-1.5 text-gray-300">10</td>
                <td className="px-3 py-1.5 text-gray-400">4th</td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 text-gray-400">K</td>
                <td className="px-3 py-1.5 text-gray-400">6</td>
                <td className="px-3 py-1.5 text-gray-500">5th</td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 text-gray-400">Q</td>
                <td className="px-3 py-1.5 text-gray-400">5</td>
                <td className="px-3 py-1.5 text-gray-500">6th (lowest)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-center text-xs text-gray-500">
          82 points per suit · <strong className="text-white">328 total</strong> points in play each round
        </p>
      </div>
    ),
  },

  // Slide 4 — Bidding
  {
    title: 'Bidding — Predict Your Score',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300 text-sm text-center">
          You get <strong className="text-white">4 cards</strong> first. Then you bid how many points your team will capture.
        </p>
        <div className="flex justify-center">
          <div className="bg-gray-800/60 rounded-xl p-4 space-y-2 w-full max-w-xs">
            <div className="flex items-center justify-between text-sm">
              <span className="bg-purple-600 text-white px-3 py-1 rounded-lg font-bold">Beat</span>
              <span className="text-gray-400">= 150 pts (minimum)</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="bg-purple-600/70 text-white px-3 py-1 rounded-lg font-bold">60, 70</span>
              <span className="text-gray-400">= 160, 170 pts</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="bg-purple-600/50 text-white px-3 py-1 rounded-lg font-bold">John</span>
              <span className="text-gray-400">= 200 pts</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-700">
              <span>John 10, John 20...</span>
              <span>210, 220...</span>
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400">
          Don't like your hand? Just <strong className="text-white">Pass</strong>. Highest bidder wins and picks trump.
        </p>
      </div>
    ),
  },

  // Slide 5 — Trump
  {
    title: 'The Hidden Trump 🔮',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300 text-sm text-center">The bid winner picks a <strong className="text-yellow-300">trump suit</strong> — but keeps it <strong className="text-red-400">secret!</strong></p>
        <div className="flex justify-center items-center gap-4 my-2">
          <div className="flex flex-col items-center">
            <div className="w-14 h-20 rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-blue-400 flex items-center justify-center text-3xl text-white shadow-lg">
              ?
            </div>
            <span className="text-[10px] text-gray-400 mt-1">Face down</span>
          </div>
          <div className="text-2xl text-gray-500">→</div>
          <div className="flex flex-col items-center">
            <div className="w-14 h-20 rounded-lg bg-white border-2 border-yellow-400 flex items-center justify-center text-3xl shadow-lg">
              ♠
            </div>
            <span className="text-[10px] text-yellow-400 mt-1">Revealed!</span>
          </div>
        </div>
        <div className="bg-gray-800/60 rounded-xl p-3 text-xs sm:text-sm text-gray-300 space-y-1.5">
          <p>🔒 Trump stays <strong className="text-white">hidden</strong> until someone can't follow the led suit</p>
          <p>🔓 When revealed, trump cards <strong className="text-yellow-300">beat everything</strong></p>
          <p>🃏 The face-down trump card goes back to the bid winner's hand</p>
        </div>
      </div>
    ),
  },

  // Slide 6 — Playing Tricks
  {
    title: 'Playing Tricks',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300 text-sm text-center">
          After bidding, you get <strong className="text-white">2 more cards</strong> (6 total). Then play <strong className="text-white">6 tricks</strong>.
        </p>
        <div className="bg-gray-800/60 rounded-xl p-4 space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">1️⃣</span>
            <span className="text-gray-300">First player leads with <strong className="text-white">any card</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">2️⃣</span>
            <span className="text-gray-300">Others <strong className="text-white">must follow suit</strong> if they can</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">3️⃣</span>
            <span className="text-gray-300">Can't follow? Play anything — or <strong className="text-orange-300">reveal trump</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">4️⃣</span>
            <span className="text-gray-300">Highest card of led suit wins (or highest <strong className="text-yellow-300">trump</strong>)</span>
          </div>
        </div>
        <p className="text-center text-xs text-gray-500">Winner of each trick leads the next one</p>
      </div>
    ),
  },

  // Slide 7 — Scoring
  {
    title: 'Scoring — Tug of War',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300 text-sm text-center">The match is a <strong className="text-yellow-300">tug-of-war</strong>. First team to <strong className="text-white">12 points</strong> wins!</p>
        <div className="flex justify-center">
          <div className="w-full max-w-xs">
            {/* Tug of war bar */}
            <div className="flex items-center gap-1 mb-2">
              <span className="text-red-400 text-xs font-bold">RED</span>
              <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 w-[60%] bg-gradient-to-r from-red-600 to-red-500 rounded-full" />
              </div>
              <span className="text-gray-400 text-xs font-bold">BLACK</span>
            </div>
            <p className="text-center text-[10px] text-gray-500 mb-3">Score swings back and forth each round</p>
          </div>
        </div>
        <div className="bg-gray-800/60 rounded-xl p-3 text-xs sm:text-sm space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-300"><strong className="text-green-400">Make</strong> your bid → your team gains <strong className="text-white">1‑2</strong> match points</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-400">✗</span>
            <span className="text-gray-300"><strong className="text-red-400">Miss</strong> your bid → opponents gain <strong className="text-white">2‑4</strong> match points</span>
          </div>
          <div className="border-t border-gray-700 pt-2 text-gray-400">
            💡 Higher bids (John+) = bigger stakes: <strong className="text-white">2/4</strong> instead of 1/2
          </div>
        </div>
      </div>
    ),
  },

  // Slide 8 — Ready
  {
    title: "You're Ready! 🎉",
    content: (
      <div className="space-y-4 text-center">
        <div className="text-4xl">🃏✨</div>
        <p className="text-gray-300 text-sm sm:text-base">That's all you need to start playing!</p>
        <div className="bg-gray-800/60 rounded-xl p-4 text-left text-xs sm:text-sm space-y-2 max-w-xs mx-auto">
          <p className="text-gray-400"><strong className="text-white">Quick recap:</strong></p>
          <p className="text-gray-300">1. Get 4 cards → <strong className="text-purple-300">Bid</strong> or Pass</p>
          <p className="text-gray-300">2. Winner picks <strong className="text-yellow-300">hidden trump</strong></p>
          <p className="text-gray-300">3. Get 2 more → play <strong className="text-white">6 tricks</strong></p>
          <p className="text-gray-300">4. Make your bid → <strong className="text-green-400">gain points</strong></p>
          <p className="text-gray-300">5. First to 12 <strong className="text-yellow-300">wins!</strong></p>
        </div>
        <p className="text-xs text-gray-500">Tap <strong className="text-blue-400">Rules</strong> anytime during the game for full details</p>
      </div>
    ),
  },
];

// ─── QuickStartGuide Component ────────────────────────────────────────
export function QuickStartGuide({ onClose }: { onClose: () => void }): ReactNode {
  const [step, setStep] = useState(0);
  const slide = slides[step];
  const isFirst = step === 0;
  const isLast = step === slides.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl border-2 border-yellow-500/50 max-w-md w-full max-h-[85vh] overflow-y-auto p-5 sm:p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-xl font-bold text-yellow-400">{slide.title}</h2>
          <button onClick={onClose} aria-label="Close"
            className="text-gray-400 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-all">×</button>
        </div>

        {/* Slide content */}
        <div className="min-h-[280px] sm:min-h-[300px] flex flex-col justify-center">
          {slide.content}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 my-4">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === step ? 'bg-yellow-400 w-4' : 'bg-gray-600 hover:bg-gray-500'}`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={isFirst}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${isFirst ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:text-white hover:bg-gray-700'}`}
          >
            ← Back
          </button>

          <span className="text-xs text-gray-500">{step + 1} / {slides.length}</span>

          {isLast ? (
            <button
              onClick={onClose}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95"
            >
              Let's Play!
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="px-5 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-bold rounded-lg shadow transition-all active:scale-95"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
