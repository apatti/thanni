# 🃏 Thanni

A digital adaptation of a traditional Indian 24-card bidding and trick-taking card game, built as a responsive web app. Play solo against 3 AI opponents — no backend, no accounts, no downloads.

**[▶ Play Now](https://apatti.github.io/thanni)**

---

## About the Game

Thanni is a partnership-based card game played across India with a 24-card deck (A, K, Q, J, 10, 9 in four suits). It combines strategic bidding, a hidden trump mechanic, and a tug-of-war scoring system that makes every round matter.

### Key Features

- **Authentic rules** — Beat, John, John 10, John 20 terminology; face-down trump; forced bids; all edge cases handled
- **Solo play** — You + AI partner (Arjun) vs two AI opponents (Vikram & Priya)
- **Thanni bid** — High-risk solo bid: win all 4 tricks with no trump, partner folded (+4 / −8 swing)
- **Hath Band call** — Post-bid solo all-6-tricks call with no trump (+6 / −12 swing)
- **Hidden trump** — Trump card stays face-down until a player requests a reveal, adding tension and bluffing depth
- **Tug-of-war scoring** — Single differential balance; first team to ±12 wins the match
- **Sound effects** — Audio cues when it's your turn to act (with mute toggle)
- **Fully offline** — No server, no database; entire game runs client-side in the browser
- **Responsive** — Works on mobile (320px+) through desktop (1920px+)

## How to Play

See the full rules in [RULES.md](RULES.md) or tap **Rules** in-game.

### Quick Summary

1. **Teams**: RED (You + Arjun) vs BLACK (Vikram + Priya)
2. **Deal**: 4 cards each → bidding → trump pick → 2 more cards → 6 tricks
3. **Bidding**: Bid how many points (out of 328) your team will capture. Minimum is Beat (150).
4. **Trump**: Bid winner picks a trump card (face-down). It's revealed when someone can't follow suit.
5. **Tricks**: Follow suit if you can. Highest card of led suit wins (or highest trump if revealed).
6. **Scoring**: Make your bid → gain match points. Miss → opponents gain more. First to 12 wins.

### Point Values

| Card | A | K | Q | J | 10 | 9 |
|------|---|---|---|---|-----|---|
| Points | 11 | 6 | 5 | 30 | 10 | 20 |

**Total per suit: 82 · Total in play: 328**

### Bid Terminology

| Points | Name |
|--------|------|
| 150 | Beat |
| 160 | 60 |
| 170 | 70 |
| 200 | John |
| 210 | John 10 |
| 220 | John 20 |
| 230+ | Numeric |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Language | TypeScript |
| Build | Vite |
| Styling | Tailwind CSS 3 |
| Audio | Web Audio API (synthesized tones, no audio files) |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions (auto-deploy on push to `main`) |

Zero runtime dependencies beyond React. No backend. No database.

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
thanni/
├── ThanniGame.tsx        # Main game UI (lobby, table, modals)
├── thanniEngine.ts        # Game engine (deck, tricks, scoring, rules)
├── thanniAI.ts            # AI decision-making (bidding, card play)
├── src/
│   ├── main.tsx           # App entry point
│   ├── sounds.ts          # Web Audio API sound effects
│   ├── ai/                # Pluggable AI strategy framework
│   ├── AIModeDropdown.tsx  # Dev tool: per-seat AI strategy selector
│   └── Markdown.tsx       # Lightweight markdown renderer (for rules)
├── RULES.md               # Game rules (also rendered in-app)
├── PRD-Indian-24Card-Bidding-Game.md  # Original product requirements
├── index.html
├── vite.config.ts
└── .github/workflows/deploy.yml  # GitHub Pages CI/CD
```

## Deployment

Every push to `main` triggers the GitHub Actions workflow which builds and deploys to GitHub Pages at:

**https://apatti.github.io/thanni**

## License

Private project.
