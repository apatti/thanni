# Product Requirement Document (PRD)
## Digital Adaptation of Traditional Indian 24-Card Bidding & Trick-Taking Game

**Version:** 1.0.0
**Status:** Draft for Review
**Date:** June 25, 2026
**Author:** Lead Product Manager & Software Architect
**Classification:** Client-Side Only · No Backend Database · Responsive Web App

---

## Table of Contents

1. [Executive Summary & Game Vision](#1-executive-summary--game-vision)
2. [Core Game Loop & Detailed State Machine](#2-core-game-loop--detailed-state-machine)
3. [UI/UX Specifications](#3-uiux-specifications)
4. [Client-Side Technical Architecture](#4-client-side-technical-architecture)
5. [Local AI Heuristics Engine](#5-local-ai-heuristics-engine)
6. [Complex Edge Cases](#6-complex-edge-cases)

---

## 1. Executive Summary & Game Vision

### 1.1 Product Overview

This product is a **digital adaptation of a traditional Indian 24-card bidding and trick-taking card game**, designed as a responsive web application playable on both mobile devices and laptop/desktop browsers. The game implements a rich heritage of partnership-based card gaming with nuanced bidding terminology, strategic trump mechanics, and a unique meta-game scoring system using virtual card decks.

### 1.2 Game Vision

> **Vision Statement:** To create an authentic, visually polished, and strategically deep digital card game experience that honors traditional Indian card-playing culture while leveraging modern web technologies to deliver a seamless, offline-capable, client-only multiplayer experience.

**Core Principles:**
- **Authenticity First:** Every rule, term, and mechanic must reflect the real-world game exactly as played in communities across India.
- **Client-Only Architecture:** No backend database. The entire game state lives in-memory and in browser local storage. Peer-to-peer WebRTC handles multiplayer sync.
- **Visual Clarity:** Complex game states (trump hiding, dual-team scoring) must be communicated through intuitive visual metaphors, not text explanations.
- **Responsive by Design:** A single codebase adapts flawlessly from 320px mobile screens to 1920px+ desktop viewports.

### 1.3 Target Audience

| Segment | Description |
|---|---|
| **Cultural Players** | Indians familiar with the traditional game seeking a digital counterpart to play with family/friends remotely |
| **Casual Gamers** | Mobile-first players who enjoy strategy card games on-the-go |
| **Purists** | Players who value authentic rules, terminology, and mechanics above all |

### 1.4 Key Differentiators

| Differentiator | Detail |
|---|---|
| **No Backend / Database** | Entire game is stateless from a server perspective; all state is client-managed |
| **Face-Down Trump Token** | The trump suit is hidden after bidding, creating tension and strategic depth |
| **6-Card Deck Scoreboard** | Score tracked using virtual Heart (Red Team) and Spade (Black Team) card decks — a visually distinctive mechanic |
| **Authentic Terminology** | "Beat", "John", "John 10", "John 20" — real terms preserved in the UI |
| **Trump Reveal Rule** | Dynamic gameplay rule where requesting trump reveal forces mandatory trump play |

### 1.5 Point Math Verification

```
Per Suit (6 cards):
  A = 11 pts
  K = 6 pts
  Q = 5 pts
  J = 30 pts
  10 = 10 pts
  9 = 20 pts
  ───────────────
  Per suit total = 82 pts

4 Suits × 82 pts = 328 pts (TOTAL POINTS IN PLAY PER ROUND) ✓
```

**Verification:** The total points in play (328) is mathematically consistent. All point values are integer-based with no fractional outcomes.

---

## 2. Core Game Loop & Detailed State Machine

### 2.1 High-Level Game Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  GAME START  │────▶│ DEALING &    │────▶│ TRICK      │────▶│ ROUND        │
│ (Setup)     │     │ BIDDING      │     │ PLAYING      │     │ SCORING      │
└─────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                        │
                                                              ┌───────┴───────┐
                                                              │               │
                                                        Win/Loss        Match Goal
                                                        Check           Reached?
                                                              │               │
                                                              ▼               ▼
                                                       NEXT ROUND      GAME OVER
                                                     (Dealer         (Winner
                                                        Rotates)       Announced)
```

### 2.2 Detailed State Machine

#### 2.2.1 Game State Schema

```typescript
interface GameState {
  // --- METADATA ---
  gameId: string;                    // Unique game session identifier
  gameVersion: string;               // Version tag for state compatibility
  startedAt: timestamp;
  status: 'LOBBY' | 'BIDDING' | 'TRUMP_SET' | 'PLAYING' | 'ROUND_SCORED' | 'MATCH_OVER';

  // --- PLAYER / SESSION INFO ---
  sessionPlayerId: PlayerId;         // The local player's ID
  players: Map<PlayerId, Player>;
  dealerId: PlayerId;               // Current dealer
  currentTrickLeaderId: PlayerId;   // Player leading the current trick
  bidWinnerId: PlayerId;            // Player who won the bid (trump chooser)
  activeTeamIds: PlayerId[];        // [leaderId, partnerId]
  inactiveTeamIds: PlayerId[];      // Opposing team

  // --- BIDDING STATE ---
  biddingPhase: BiddingState;
  highestBid: Bid | null;
  passCount: number;                // Count of consecutive passes

  // --- TRUMP STATE ---
  trumpSuit: Suit | null;          // Hidden until first reveal request
  trumpFaceDown: boolean;          // Always true until revealed
  cardsPlayedThisTrick: PlayedCard[];

  // --- SCOREBOARD STATE (6-CARD DECK SYSTEM) ---
  redTeamScore: TeamScore;         // Hearts deck (scoring card)
  blackTeamScore: TeamScore;       // Spades deck (scoring card)
  matchGoal: number;               // Default: 12 points

  // --- DECK / CARDS ---
  remainingDeck: Card[];           // Cards not yet dealt
  trickPile: PlayedCard[];         // Cards played in current trick

  // --- PERSISTENCE ---
  lastSavedAt: timestamp;
  stateHash: string;               // For integrity validation on reload
}
```

#### 2.2.2 Player State

```typescript
interface Player {
  playerId: PlayerId;
  name: string;
  isHuman: boolean;
  isBot: boolean;                    // AI-controlled
  seatPosition: 0 | 1 | 2 | 3;      // Clockwise position (0 = N, 1 = NE, etc.)
  team: 'RED' | 'BLACK';            // Team affiliation
  partnerId: PlayerId;              // teammate
  hand: Card[];                     // Current cards in hand (sorted by game logic)
  bid: Bid | null;                  // Their placed bid (if any)
  tricksWon: number;                // Tricks won this round
  roundPoints: number;              // Points captured this round
  isDisconnected: boolean;
}
```

#### 2.2.3 Bidding State

```typescript
interface BiddingState {
  phase: 'PRE_FIRST_DEAL' | 'POST_SECOND_DEAL';
  currentPlayerToBid: PlayerId;
  bids: Map<PlayerId, Bid>;         // Recorded bids per player
  passes: Map<PlayerId, boolean>;   // Whether player passed
  minAcceptableBid: number;         // Default: 150 (Beat)
  bidIncrements: number[];          // [160, 170, 200(John), 210(John 10), ...]
  allPassedCount: number;           // Consecutive passes since last bid
  forcedBidTriggered: boolean;      // True if first player was forced to bid Beat
}
```

#### 2.2.4 Team Score State (6-Card Deck System)

```typescript
interface TeamScore {
  points: number;                    // Current team score in match points
  isFaceUp: boolean;                // Whether the team's score card is revealed
  deckCards: SuitCard[];           // Up to 6 virtual cards showing "how many"
  faceUpAt?: timestamp;             // When this team first scored (for ordering)
}
```

### 2.3 State Transitions — Detailed

#### STAGE 1: LOBBY / GAME SETUP

```
TRANSITION: LOBBY → BIDDING
Trigger: All 4 players have joined the game session.
Actions:
  - Randomly assign dealer (seat position 0-3)
  - Initialize all player hands as empty arrays
  - Set trumpFaceDown = true, trumpSuit = null
  - Reset both team scores to { points: 0, isFaceUp: false }
  - Switch status to 'BIDDING'
```

#### STAGE 2: DEALING & BIDDING (Two-Phase Deal)

```
TRANSITION: BIDDING.PHASE1 → BIDDING.PHASE2
Trigger: After first deal (4 cards each).
Actions:
  - Distribute 4 cards to each player from shuffled 24-card deck
  - Players view their 4 cards (humans see face-up; bots show placeholder)
  - Bidding begins clockwise from player left of dealer

TRANSITION: BIDDING.PHASE2 → TRUMP_SET
Trigger: Bidding complete (highest bidder determined or forced bid triggered).
Actions:
  - Distribute remaining 2 cards to each player (now 6 cards in hand)
  - Bid winner chooses Trump suit (if human) OR AI chooses (if bot)
  - Place one card of Trump suit face DOWN on the trump position
  - Set status to 'TRUMP_SET' — trump suit is UNKNOWN to all players

STATE: TRUMP_SET (transient, ~2 second delay then → PLAYING)
Actions:
  - Visual animation showing a face-down card being placed at center
  - Text overlay: "Trump has been set. The suit is unknown."
  - After delay, transition to 'PLAYING'
```

**Bidding Logic Details:**

| Rule | Implementation |
|---|---|
| Minimum bid ("Beat") | 150 points — can only be bid if all 4 players have passed |
| First player forced | If all 4 pass, Player 0 (first to speak) is forced to bid 150 |
| Bid increments | 160, 170, then 200(John), 210(John 10), 220(John 20), up to max 328 |
| Bidding stops | When 3 players have passed after a bid (the bidder's team wins the bid) |
| Trump selection | Highest bidder picks trump suit from their hand (or AI picks optimally) |

**Terminology Mapping Table:**

| Points | Display Label | Notes |
|---|---|---|
| 150 | `Beat` | Minimum bid / forced bid |
| 160 | `60` | Abbreviated display |
| 170 | `70` | Abbreviated display |
| 200 | `John` | Special name |
| 210 | `John 10` | John + 10 |
| 220 | `John 20` | John + 20 |
| 230+ | `230`, `240`, ... | Full numeric display |

#### STAGE 3: TRICK PLAYING (6 Tricks Per Round)

```
TRANSITION: TRUMP_SET → PLAYING
Trigger: After trump is set and dealt.
Actions:
  - First trick led by player LEFT of dealer
  - Status = 'PLAYING'
  - Face-down trump card visible but suit hidden

DURING EACH TRICK:
┌─────────────────────────────────────────────────────────────┐
│ FOR EACH PLAY IN A TRICK (Clockwise):                        │
│   1. Check if current player must follow led suit            │
│   2. If can follow: MUST play that suit                      │
│   3. If cannot follow:                                       │
│      a. Can REQUEST TRUMP REVEAL (once per game)             │
│      b. OR play any card from hand                           │
│   4. Validate the played card                                │
│   5. Add to trickPile                                         │
│   6. If all 4 players have played: evaluate trick            │
└─────────────────────────────────────────────────────────────┘

TRUMP REVEAL RULE (CRITICAL):
When a player requests trump reveal:
  - Trump card turns FACE UP (suit is now public knowledge)
  - That player MUST play a trump card if they have one
  - They can only discard a non-trump suit if void of trump
  - This state persists for all remaining tricks this round

EVALUATING A TRICK:
  1. Identify the led suit
  2. Check if any trump cards were played
  3. Winner determination:
     a. If trumps played: highest trump card wins
     b. If no trumps: highest card of led suit wins
  4. Winner collects all 4 cards (display animation)
  5. Winner leads next trick

ROUND END:
  - After 6 tricks total, round ends
  - Transition to ROUND_SCORED state
```

#### STAGE 4: ROUND SCORING & MATCH PROGRESSION

```
TRANSITION: PLAYING → ROUND_SCORED
Trigger: All 6 tricks have been completed in a round.
Actions:
  - Calculate each team's captured points for the round
  - Compare bidding team's actual points vs their bid
  - Apply scoring rules (see Section 4)
  - Update match-point scoreboard
  - Check if any team has reached match goal (12 points)

SCORING LOGIC:

HIGH-VALUE BONUS RULE (BID >= 200 / John or higher):
When the bid amount is 200 points or greater (John, John 10, John 20, etc.):
  IF BIDDING TEAM MEETS OR EXCEEDS BID:
     IF bidding team's score card is FACE UP:
        → Bidding team gets +2 match points
     ELSE:
        → Reduce opposition's face-up score by -2 (minimum 0)
  ELSE (BIDDING TEAM FAILS TO MEET BID):
     → Opposition gets +4 match points
      Applied to opposition's face-up score OR
      Reduce bidding team's face-up score (depending on their status)

STANDARD BIDS (BID < 200 / Beat, 60, 70):
When the bid amount is below 200 points (150/Beat, 160/60, 170/70):
  IF BIDDING TEAM MEETS OR EXCEEDS BID:
     IF bidding team's score card is FACE UP:
        → Bidding team gets +1 match point
     ELSE:
        → Reduce opposition's face-up score by -1 (minimum 0)
  ELSE (BIDDING TEAM FAILS TO MEET BID):
     → Opposition gets +2 match points
      Applied to opposition's face-up score OR
      Reduce bidding team's face-up score (depending on their status)

POST-SCORING:
  Check Match Goal:
    IF any team's match points >= 12:
      → Status = 'MATCH_OVER', announce winner
    ELSE:
      → Dealer rotates to team whose score card was JUST SCORED
        (Specifically: the team with face-down card deals next)
      → New round begins (back to DEALING & BIDDING)
      → Reset hands, tricks, bids — but keep match points
```

**Dealer Rotation Rule (Detailed):**
> The team whose score card is currently **FACE DOWN** must deal until their score card turns **FACE UP**.

Implementation:
```
After each round:
  IF redTeam.isFaceUp == true AND blackTeam.isFaceUp == false:
    → Red team deals next
  ELSE IF blackTeam.isFaceUp == true AND redTeam.isFaceUp == false:
    → Black team deals next
  ELSE (both face-up):
    → Rotate dealer clockwise from previous dealer
  ELSE (both face-down — initial state):
    → Random dealer, first scoring team turns card face-up
```

### 2.4 Complete State Machine Diagram (Textual)

```
[LOBBY]
   │
   ▼
[BIDDING.PHASE1] ──(4 cards dealt)──▶ [Bidding in progress]
   │                                     │
   │                                     ▼
[BIDDING.PHASE2] ◀── (2 more cards dealt) ── [All 4 passed → Forced Beat]
   │
   ▼
[TRUMP_SET] ──(Trump chosen, card face-down)──▶ [PLAYING]
   │                                                     │
   │                                                     ▼
   │                                              [Trick 1 of 6]
   │                                                     │
   │                                                     ▼
   │                                              [Trick 6 of 6 completed]
   │                                                     │
   ▼                                                     ▼
[ROUND_SCORED] ◀────────────────────────── [Calculate points & apply]
   │
   ├──▶ Any team >= 12 match points?
   │     │
   │     ├── YES → [MATCH_OVER] (Game complete)
   │     │
   │     └── NO → [LOBBY] (New round, dealer rotates, hands reset)
   │
```

---

## 3. UI/UX Specifications

### 3.1 Design Philosophy

> **Principle:** Every visual element must communicate game state instantly, without requiring the player to read text. Card values, trump status, team scores — all should be understood at a glance through visual metaphors and consistent layout patterns.

### 3.2 Screen Layout — Responsive Breakpoints

| Breakpoint | Device | Viewport | Layout Adaptation |
|---|---|---|---|
| `xs` (320px–479px) | Mobile portrait | Narrow, vertical stack | Cards stack vertically; opponent cards shown as face-down back images; scoreboard in collapsible drawer |
| `sm` (480px–767px) | Mobile landscape / Tablet portrait | Moderate width | Opponent cards shown in arc layout; partial card visibility for hand members above/below |
| `md` (768px–1023px) | Tablet landscape | Wide enough for 4 hands visible | Full table view with all 4 players' hands visible; compact card rendering |
| `lg` (1024px+) | Laptop / Desktop | Full width | Expanded table view; hover effects on cards; animated card movements; scoreboard always visible |

### 3.3 Game Table Layout (Desktop / lg+)

```
┌─────────────────────────────────────────────────────────────┐
│  [SCOREBOARD: Red Team ♥♥• ••••]    [Game Info Panel]      │
│                                                                       │
│   ┌──────────────┐                                    ┌──────────────┐
│   │ Opponent     │                                    │ Opponent     │
│   │ (North)      │                                    │ (East)       │
│   │ ■■ ■■ ■■    │                                    │ ■■ ■■ ■■    │
│   └──────────────┘         ┌──────────┐             └──────────────┘
│                             │          │
│                             │  TRUMP   │ ← Face-down card here (unknown suit)
│                             │   ZONE   │
│                             │          │
│   ┌──────────────┐          │   Center: Trick area for played cards    │
│   │ Left          │◀─────▶▶ │   Shows all 4 cards of current trick    │
│   │ (West)        │          │   with winner highlight                  │
│   │ A K Q J       │          └──────────┘             ┌──────────────┐
│   └──────────────┘                                    │ Right        │
│                                                        │ (South)      │
│   ┌──────────────┐                                    │ A♠ K♥ Q♦    │
│   │ You           │                                    │ J♠ 10♥ 9♦   │
│   │ (Bottom)      │                                    │ [YOUR HAND] │
│   │ Cards in hand │                                    └──────────────┘
│   └──────────────┘                                          ▲
│                                                              │ YOUR PLAY ZONE
│                                                              │ (Select → Play)
└─────────────────────────────────────────────────────────────┘
```

**Key UI Elements:**

1. **Center Trump Zone**: Displays a face-down card graphic. When revealed, animates to show the suit. This zone sits at the table's center and persists throughout the round.

2. **Scoreboard Bar (Top)**: Always-visible horizontal bar showing both teams' scores via the 6-card deck visual metaphor.

3. **Play Zone (Center-Bottom)**: Where the local player selects and plays cards from their hand.

4. **Opponent Hands**: Shown as face-down card backs for privacy (since bots or remote opponents' cards should not be visible).

### 3.4 The 6-Card Deck Scoreboard (CRITICAL UI COMPONENT)

This is the **hero visual feature** of the entire game. It must be implemented with precision and polish.

#### 3.4.1 Visual Design

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│   RED TEAM (Hearts)                                          │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
│   │      │  │      │  │ •    │  │ •    │  │ •    │  │ •    │
│   │  ?   │  │  ?   │  │  ♥   │  │  ♥   │  │  ♥   │  │  ♥   │
│   │      │  │      │  │      │  │      │  │      │  │      │
│   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘
│    FACE        FACE       1st        2nd        3rd        4th
│    DOWN        POINT    POINT      POINT     POINT      POINT
│                                                               │
│   BLACK TEAM (Spades)                                         │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
│   │      │  │      │  │ •    │  │ •    │  │ •    │  │ •    │
│   │  ?   │  │  ?   │  │  ♠   │  │  ♠   │  │  ♠   │  │  ♠   │
│   │      │  │      │  │      │  │      │  │      │  │      │
│   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘
│    FACE        FACE       1st        2nd        3rd        4th
│    DOWN        POINT    POINT      POINT     POINT      POINT
│                                                               │
└─────────────────────────────────────────────────────────────┘

Legend:
  ■ = Face-down card (unknown score status)
  • with suit symbol = Face-up card representing a scored point
  Cards are ordered left-to-right by when they were scored
```

#### 3.4.2 Behavior Rules

| Condition | Visual Behavior |
|---|---|
| **Game Start** | All 12 cards (6 Red + 6 Black) face-down, slightly spaced apart in a row |
| **Red Team scores first point** | Leftmost Red card flips to face-up, revealing a ♥ symbol |
| **Red Team scores second point** | Second Red card flips face-up |
| **Up to 6 points** | Each point reveals the next card; after 6 cards all remaining are shown as "bonus" text badge |
| **Black Team scores first point** | Leftmost Black card flips face-up, revealing a ♠ symbol |
| **Match Goal Reached (12 pts)** | Winning team's cards fan out in celebration animation |

#### 3.4.3 Mobile Adaptation

On mobile (xs/sm breakpoints), the scoreboard becomes a **collapsible accordion**:

```
┌─────────────────────┐
│ ▼ SCORE              │ ← Tap to expand
├─────────────────────┤
│ RED: ♥ •  •  •       │
│ BLACK: ♠ •           │
└─────────────────────┘
```

Expanded state shows the full 6-card deck visualization.

### 3.5 Bidding UI

#### 3.5.1 Bidding Panel (Appears during Bidding Phase)

```
┌─────────────────────────────────────────────────────────────┐
│                     BIDDING ROUND                            │
│                                                               │
│   Your estimated points: ~120 (calculated from your 4 cards) │
│                                                               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Current Bid: Beat (150)                               │   │
│   │ Next Available: 160, 170, John(200), J10(210)...    │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                               │
│   [ Bid 160 ]  [ Bid 170 ]  [ Bid John (200) ]              │
│   [ Bid J10(210)] [ Bid J20(220)] [ Pass ]                   │
│                                                               │
│   Notes:                                                     │
│   • "Beat" = minimum if all passed                           │
│   • Terms auto-update based on current bid                    │
│   • You can only bid higher than current bid                  │
└─────────────────────────────────────────────────────────────┘
```

#### 3.5.2 Bidding Flow States

| State | UI Behavior |
|---|---|
| `YOUR_TURN_TO_BID` | Bidding panel becomes interactive; others show "Waiting..." |
| `OPPONENT_BIDS` | Panel shows "Opponent X bid Y" with a dismiss button |
| `OPPONENT_PASSES` | Panel shows "Opponent X passed" with strike-through animation |
| `BIDDING_CLOSED` | Panel fades out; trump selection UI appears (if you won) |

### 3.6 Trump Reveal Animation

```
Sequence:
1. Player clicks "Reveal Trump" button (available only once per game, when they request it)
2. Face-down card at center glows/pulses for 0.5s
3. Card flips with a CSS 3D transform animation
4. Suit symbol appears in large text below: "TRUMP SUIT: ♠ SPADES"
5. System message: "You requested the trump reveal. You must now play Spades if you have one."
6. If player has trump cards: system highlights them (subtle glow)
7. Player's hand is now constrained: must play a trump card if available
```

**Visual Design for Face-Down Trump Card:**
- Small card-sized rectangle at table center
- Shows back pattern (no suit visible)
- Hover tooltip: "Trump suit is hidden" (or "TRUMP SET — ♠ SPADES" after reveal)
- After reveal: rotates to show the suit face

### 3.7 Card Component Design

```typescript
// Card component props interface
interface CardComponentProps {
  card: Card;                      // Card data (suit, value)
  faceUp: boolean;                 // Face-down shows back pattern
  size: 'small' | 'medium' | 'large'; // Responsive sizing
  interactive?: boolean;           // Click/hover states enabled
  highlight?: 'none' | 'trump' | 'winner' | 'your-hand';
  onPlay?: () => void;             // onClick handler for playing card
}
```

**Card Visual States:**

| State | Appearance |
|---|---|
| Face-down | Gradient back pattern (teal/green with geometric design) |
| Face-up — Red suit | White background, red text/symbols |
| Face-up — Black suit | White background, black/dark text/symbols |
| Trump highlighted | Gold border glow + small ♠ icon in corner |
| Winner highlight | Green checkmark overlay |
| Your hand (mobile) | Larger cards, stacked vertically |

### 3.8 Responsive Layout Specifications

#### Desktop (lg+): 1024px+

```
CSS Grid Layout:
┌─────────────────────────────────────────────────────┐
│ .scoreboard-bar (full width, sticky top)              │
├─────────────────────────────────────────────────────┤
│ .game-table {                                           │
│   display: grid;                                       │
│   grid-template-columns: 1fr auto 1fr;                │
│   grid-template-rows: 1fr auto 1fr;                   │
│   gap: 16px;                                           │
│ }                                                       │
│ .opponent-top    { grid-column: 2; grid-row: 1; }     │
│ .trump-zone      { grid-column: 2; grid-row: 2; }     │
│ .play-zone       { grid-column: 2; grid-row: 3; }     │
│ .opponent-left   { grid-column: 1; grid-row: 2; }     │
│ .opponent-right  { grid-column: 3; grid-row: 2; }     │
│ .opponent-bottom { grid-column: 2; grid-row: 3; }     │
└─────────────────────────────────────────────────────┘
```

#### Mobile (xs): 320px–479px

```
Single Column Layout:
┌──────────────────────────┐
│ .scoreboard-toggle (tap)  │ ← Collapsible
├──────────────────────────┤
│ .opponent-top             │ ← Shown as face-down backs only
├──────────────────────────┤
│ .game-center              │ ← Trump zone + trick cards
├──────────────────────────┤
│ .opponent-side-left/right │ ← Collapsed row above/below center
├──────────────────────────┤
│ .player-hand              │ ← Your cards, scrollable horizontally
├──────────────────────────┤
│ .play-button              │ ← "Play Selected" or auto-play
└──────────────────────────┘
```

### 3.9 Color Palette & Typography

| Element | Color / Style |
|---|---|
| Table background | `#1B5E20` (deep green felt) with subtle texture overlay |
| Card background | `#FFFFFF` with `#E0E0E0` border |
| Red suits (♥, ♦) | `#D32F2F` |
| Black suits (♠, ♣) | `#212121` |
| Trump highlight | `#FFD600` (gold) with 2px solid border |
| Winning trick | `#4CAF50` (green) glow effect |
| Bidding panel bg | `#263238` (dark blue-grey) |
| Text (light mode) | `#FFFFFF` on dark backgrounds |
| Text (dark mode) | `#E0E0E0` on light card backgrounds |
| Font (primary) | `Inter` or `Poppins` (modern, clean, highly readable) |
| Font (numbers) | `Roboto Mono` for score displays |

### 3.10 Accessibility Requirements (WCAG 2.1 AA)

| Requirement | Implementation |
|---|---|
| Keyboard Navigation | Tab through all interactive elements; Enter/Space to select cards |
| Screen Reader Labels | ARIA labels on all card components: "Ace of Spades", "Face-down card" |
| Color Contrast | All text and symbols meet 4.5:1 minimum contrast ratio |
| Focus Indicators | Visible outline (3px solid `#FFD600`) on focused elements |
| Reduced Motion | `prefers-reduced-motion` media query disables card flip animations |
| Touch Targets | Minimum 44×44px tap targets on mobile |

---

## 4. Client-Side Technical Architecture

### 4.1 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | React 18 (with Vite) | Fast, modern, mature ecosystem; ideal for stateful UI apps |
| **Language** | TypeScript 5 | Strict typing for game state, card types, and player models |
| **State Management** | Zustand | Lightweight, no boilerplate; perfect for client-only state |
| **Styling** | Tailwind CSS 3 + CSS Variables | Utility-first, responsive by default; custom properties for theming |
| **Animations** | Framer Motion | Declarative animations for card flips, deals, and trick transitions |
| **Multiplayer Sync** | PeerJS (WebRTC wrapper) | Simplifies peer-to-peer signaling; no server-side code needed |
| **Persistence** | `localStorage` + `sessionStorage` | Game state snapshot for recovery after page refresh |
| **Build Tool** | Vite | Instant HMR, optimized production builds |
| **Testing** | Vitest + React Testing Library | Fast unit & integration tests |

### 4.2 Project Structure

```
thanni/                                # Game project root
├── public/
│   ├── manifest.json                  # PWA manifest for installability
│   └── robots.txt
├── src/
│   ├── main.tsx                       # Entry point
│   ├── App.tsx                        # Root component
│   │
│   ├── game/                          # Game logic & state
│   │   ├── types/                     # TypeScript interfaces
│   │   │   ├── Card.ts                # Card, Suit, Value types
│   │   │   ├── Player.ts              # Player interface
│   │   │   ├── GameState.ts           # Full game state schema
│   │   │   ├── Bid.ts                 # Bid type & terminology map
│   │   │   └── Trick.ts               # Trick evaluation results
│   │   │
│   │   ├── store/                     # Zustand stores
│   │   │   ├── gameStore.ts           # Main game state store
│   │   │   ├── uiStore.ts             # UI state (panels, modals)
│   │   │   └── audioStore.ts          # Sound preferences & state
│   │   │
│   │   ├── engine/                    # Pure game logic functions
│   │   │   ├── DeckBuilder.ts         # Creates 24-card deck
│   │   │   ├── Dealer.ts              # Card dealing logic
│   │   │   ├── Bidder.ts              # Bidding calculation & rules
│   │   │   ├── TrickEvaluator.ts      # Determines trick winner
│   │   │   ├── Scorer.ts              # Round scoring logic
│   │   │   └── GameStateValidator.ts  # State integrity checker
│   │   │
│   │   ├── ai/                        # Bot logic
│   │   │   ├── AIBidder.ts            # AI bidding strategy
│   │   │   ├── AICardPlayer.ts        # AI trick-playing strategy
│   │   │   └── AIGameReader.ts         # Reads state, makes decisions
│   │   │
│   │   └── persistence/               # Local storage handling
│   │       ├── StateSerializer.ts     # Serializes/deserializes GameState
│   │       ├── StateHasher.ts         # Computes integrity hash
│   │       └── StorageAdapter.ts      # Wraps localStorage API
│   │
│   ├── components/                    # React components
│   │   ├── layout/
│   │   │   ├── GameTable.tsx           # Main table container
│   │   │   ├── PlayerSeat.tsx         # Seat position wrapper
│   │   │   └── ScoreboardBar.tsx      # 6-card deck scoreboard
│   │   │
│   │   ├── cards/
│   │   │   ├── CardComponent.tsx       # Individual card render
│   │   │   ├── HandContainer.tsx       # Player's hand display
│   │   │   └── TrickPile.tsx           # Center trick area
│   │   │
│   │   ├── bidding/
│   │   │   ├── BiddingPanel.tsx        # Bid/Pass UI
│   │   │   ├── BidDisplay.tsx          # Current bid display
│   │   │   └── BidHistory.tsx          # Past bids log
│   │   │
│   │   ├── trumps/
│   │   │   ├── TrumpZone.tsx           # Face-down trump card
│   │   │   └── TrumpRevealButton.tsx   # Reveal control
│   │   │
│   │   ├── overlays/
│   │   │   ├── GameOverOverlay.tsx     # Match end screen
│   │   │   ├── RoundResultOverlay.tsx  # Per-round summary
│   │   │   └── LobbyOverlay.tsx        # Pre-game lobby
│   │   │
│   │   └── shared/
│   │       ├── Button.tsx              # Reusable button
│   │       ├── ProgressBar.tsx         # Score progress bar
│   │       └── Loader.tsx              # Spinner / loading state
│   │
│   ├── hooks/                         # Custom React hooks
│   │   ├── useGameState.ts             # Subscribe to game store
│   │   ├── usePlayerTurn.ts            # Know when it's your turn
│   │   ├── useValidCards.ts            # Get legally playable cards
│   │   └── useSoundToggle.ts           # Audio on/off preference
│   │
│   ├── utils/                         # Utility functions
│   │   ├── constants.ts               # Card values, suit enums
│   │   ├── helpers.ts                 # Formatting, math helpers
│   │   └── analytics.ts               # Optional: GA4 event tracking
│   │
│   └── styles/
│       ├── globals.css                # Base styles, Tailwind imports
│       ├── variables.css              # Custom CSS properties
│       └── animations.css             # Keyframe animations
│
├── index.html                         # HTML entry
├── vite.config.ts                     # Vite configuration
├── tailwind.config.js                 # Tailwind settings
├── tsconfig.json                      # TypeScript config
└── package.json                       # Dependencies
```

### 4.3 Core State Schema (Detailed)

```typescript
// ==================== CARD TYPES ====================

type Suit = 'HEARTS' | 'DIAMONDS' | 'SPADES' | 'CLUBS';

type CardValue = 'A' | 'K' | 'Q' | 'J' | '10' | '9';

interface Card {
  suit: Suit;
  value: CardValue;
  pointValue: number;              // J=30, 9=20, A=11, 10=10, K=6, Q=5
  id: string;                      // Unique identifier (e.g., "AH" = Ace of Hearts)
}

// ==================== PLAYER ====================

type PlayerId = string;            // e.g., "p0", "p1", "p2", "p3"

interface Player {
  playerId: PlayerId;
  name: string;
  seatPosition: 0 | 1 | 2 | 3;    // 0=N, 1=NE, 2=S, 3=W (clockwise)
  team: 'RED' | 'BLACK';
  partnerId: PlayerId;
  hand: Card[];                    // Current cards
  isHuman: boolean;
  isBot: boolean;
  bid: number | null;              // Bid amount (or null if not placed)
  tricksWonThisRound: number;
  pointsCapturedThisRound: number;
  isDisconnected: boolean;
  disconnectTime?: number;         // Timestamp of disconnection
}

// ==================== BIDDING ====================

interface Bid {
  amount: number;                  // e.g., 150, 160, 200
  playerId: PlayerId;              // Who made this bid
  displayName: string;             // "Beat", "John", "70", etc.
  timestamp: number;               // When this bid was made
}

// ==================== TRICK ====================

interface PlayedCard {
  card: Card;
  playerId: PlayerId;              // Who played it
  trickNumber: number;             // 1–6
  positionInTrick: number;         // 1–4 (order of play)
}

// ==================== TEAM SCORE ====================

interface TeamScore {
  points: number;                  // Match points (0–12+)
  isFaceUp: boolean;               // For dealer rotation rule
  scoreCards: Array<{
    cardId: string;                // Virtual card identifier
    scoredAt: number | null;       // When scored (null = face-down)
  }>;                              // Up to 6 cards per team
}

// ==================== GAME STATE ====================

type GameStatus = 
  | 'LOBBY'              
  | 'BIDDING_PHASE1'        // After first deal (4 cards), bidding ongoing
  | 'BIDDING_PHASE2'        // After second deal (6 cards), bidding finalizing
  | 'TRUMP_SET'             // Trump chosen, face down, about to play
  | 'PLAYING'               // Tricks are being played
  | 'TRUMP_REVEALED'        // Player requested trump reveal mid-trick
  | 'ROUND_SCORED'          // Round complete, points applied
  | 'MATCH_OVER';            // A team reached 12 match points

interface BiddingState {
  phase: 'PRE_FIRST_DEAL' | 'POST_SECOND_DEAL';
  currentPlayerToBid: PlayerId;
  currentHighestBid: Bid | null;
  passesSinceLastBid: number;  // Count of consecutive passes
  allPlayersHavePassed: boolean;
  forcedBidTriggered: boolean;
  bids: Map<PlayerId, Bid>;
}

interface GameState {
  // --- METADATA ---
  gameId: string;
  version: 'v1';
  status: GameStatus;
  startedAt: number;
  lastSavedAt: number;

  // --- PLAYERS ---
  players: Map<PlayerId, Player>;
  dealerId: PlayerId;
  
  // --- BIDDING ---
  biddingState: BiddingState;
  bidWinnerId: PlayerId | null;
  
  // --- TRUMP ---
  trumpSuit: Suit | null;           // null = hidden
  trumpFaceDown: boolean;
  trumpRevealedThisRound: boolean;  // Once revealed, stays revealed this round
  
  // --- GAME FLOW ---
  currentTrickNumber: number;       // 0–6
  currentLeadPlayerId: PlayerId | null;
  trickPile: PlayedCard[];
  
  // --- SCORES ---
  redTeamScore: TeamScore;
  blackTeamScore: TeamScore;
  matchGoal: number;                // Default 12

  // --- PERSISTENCE ---
  stateHash: string;                // SHA-256 hash for integrity
  
  // --- MULTIPLAYER ---
  peerId?: string;                  // This client's PeerJS ID
  peerConnections?: Map<PlayerId, object>; // Active WebRTC connections
}
```

### 4.4 Local Storage Persistence

#### 4.4.1 State Serialization Strategy

```typescript
// storage/StateSerializer.ts

interface SerializedState {
  snapshot: GameState;
  hash: string;
  timestamp: number;
  version: string;
}

class StateSerializer {
  /**
   * Serialize GameState to a JSON string for localStorage
   */
  static serialize(state: GameState): string {
    const cloned = this.deepClone(state);
    return JSON.stringify({
      snapshot: cloned,
      hash: computeHash(JSON.stringify(cloned)),
      timestamp: Date.now(),
      version: 'v1'
    }, null, 2);
  }

  /**
   * Deserialize from localStorage with hash verification
   */
  static deserialize(raw: string): GameState | null {
    let parsed: SerializedState;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    
    // Verify integrity
    const computedHash = computeHash(JSON.stringify(parsed.snapshot));
    if (computedHash !== parsed.hash) {
      console.warn('⚠️ State integrity check failed. Game state may be corrupted.');
      return null;
    }

    return parsed.snapshot;
  }

  /**
   * Auto-save with debounce to prevent excessive writes
   */
  static debouncedSave(state: GameState, delayMs = 1000): void {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.save(state);
    }, delayMs);
  }

  /**
   * Save to localStorage key 'thanni_game_state'
   */
  static save(state: GameState): void {
    const serialized = this.serialize(state);
    localStorage.setItem('thanni_game_state', serialized);
    
    // Also save to sessionStorage for recovery across tabs
    sessionStorage.setItem('thanni_game_state_session', serialized);
  }

  /**
   * Load from localStorage (e.g., after page refresh)
   */
  static load(): GameState | null {
    const raw = localStorage.getItem('thanni_game_state');
    const sessionRaw = sessionStorage.getItem('thanni_game_state_session');
    
    // Prefer localStorage, fallback to sessionStorage
    return this.deserialize(raw ?? sessionRaw);
  }

  /**
   * Clear all stored state (e.g., on new game)
   */
  static clear(): void {
    localStorage.removeItem('thanni_game_state');
    sessionStorage.removeItem('thanni_game_state_session');
  }

  private static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
```

#### 4.4.2 Persistence Triggers

| Event | Action |
|---|---|
| Any state change | Debounced save (1s delay) |
| Round complete / scored | Immediate save + log event |
| Match over | Immediate save + show "Share Result" option |
| Page unload | Final save to sessionStorage |
| New game started | Clear all storage |

#### 4.4.3 Recovery Flow (After Page Refresh)

```
On App Mount:
  │
  ▼
Check localStorage for saved state
  │
  ├── Found valid state?
  │     │
  │     ├── Status is 'LOBBY' or early bidding?
  │     │     └──▶ Show "Resume Game" button
  │     │
  │     └── Status is mid-trick / playing?
  │           └──▶ Auto-resume with notification: "Game restored from last save"
  │
  └── Not found?
        └──▶ Show fresh game lobby / single-player setup
```

### 4.5 Peer-to-Peer Multiplayer Architecture (WebRTC via PeerJS)

Since there is **no backend server**, multiplayer sync uses a **host-client model** where one player's browser acts as the authoritative game host.

#### 4.5.1 Host-Based Architecture

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   HOST PLAYER (Browser A)                            │
│   ┌───────────────────────────────────────┐         │
│   │ Game State (authoritative)             │         │
│   │ - All player hands                     │         │
│   │ - Bidding state                        │         │
│   │ - Trick evaluation                     │         │
│   │ - Score tracking                       │         │
│   └───────────────────────────────────────┘         │
│              ▲ PeerJS Connection                      │
│              ▼                                         │
│   Non-Host Players (Browser B, C, D)                   │
│   ┌───────────────────────────────────────┐         │
│   │ View-only state + Input only their     │         │
│   │ actions (play card / place bid)        │         │
│   └───────────────────────────────────────┘         │
│                                                      │
└──────────────────────────────────────────────────────┘

IMPORTANT: The HOST's browser runs the game logic.
Non-host players only receive state snapshots and send their inputs.
```

#### 4.5.2 PeerJS Communication Protocol

```typescript
// types/PeerProtocol.ts

type MessageType = 
  | 'OFFER'              // Create connection offer
  | 'ANSWER'             // Respond to offer
  | 'ICE_CANDIDATE'     // Exchange ICE candidates
  | 'STATE_SNAPSHOT'     // Full game state (sent on join or after each action)
  | 'PLAYER_ACTION'      // Bid, pass, play card
  | 'ACTION_ACK'         // Confirmation of action
  | 'PING'               // Heartbeat keep-alive
  | 'PONG'               // Keep-alive response
  | 'DISCONNECT'          // Player leaving
  | 'RESUME_REQUEST'    // Reconnecting player requesting state
  | 'ERROR';             // Error message

interface PeerMessage {
  type: MessageType;
  senderId: PlayerId;
  data: any;              // Payload (state snapshot, action, etc.)
  timestamp: number;
  sequenceNumber?: number; // For ordering/deduplication
}
```

#### 4.5.3 Host Selection & Connection Flow

```
1. PLAYER A CREATES GAME
   ├── Generates unique gameId
   ├── Becomes HOST automatically
   ├── Starts PeerJS server listener
   └── Shares gameId with other players (via QR code / link)

2. PLAYER B JOINS GAME
   ├── Creates PeerJS client connection to Player A
   ├── Sends JOIN message with player info
   ├── Host sends full STATE_SNAPSHOT back
   ├── Player B initializes local state from snapshot
   └── Connection established

3. DURING GAME PLAY
   ├── Any player clicks "Play Card" or "Place Bid"
   ├── Action sent as PLAYER_ACTION to HOST
   ├── HOST validates action against game state
   ├── HOST updates state
   ├── HOST broadcasts updated STATE_SNAPSHOT to ALL peers
   └── All players render the new state

4. IF A PLAYER DISCONNECTS
   ├── Host detects missing PONG response (>10s)
   ├── Mark player as isDisconnected = true
   ├── If bot: continue with last known strategy
   ├── If human: hold their turn; offer "Skip Turn" after 30s
   └── On reconnect: send RESUME_REQUEST, host sends latest snapshot
```

#### 4.5.4 State Sync Strategy (Optimistic + Reconciliation)

```typescript
// Simplified sync logic for non-host players

class StateSyncManager {
  private lastKnownSequence = 0;
  
  /**
   * Non-host player plays a card:
   */
  async playCard(cardId: string): Promise<void> {
    // Send action to host
    const ack = await this.peer.send({
      type: 'PLAYER_ACTION',
      data: { cardId }
    });
    
    // Optimistic: assume success, host will reconcile if invalid
    this.lastKnownSequence = ack.sequenceNumber;
  }

  /**
   * On receiving state snapshot from host:
   */
  onStateSnapshot(snapshot: GameState): void {
    // If sequence number went backward, revert local changes
    if (snapshot.sequenceNumber < this.lastKnownSequence) {
      this.revertToSnapshot(snapshot);
    } else {
      this.applySnapshot(snapshot);
      this.lastKnownSequence = snapshot.sequenceNumber;
    }
  }
}
```

### 4.6 Game State Example (Full Round Trace)

```typescript
const initialState: GameState = {
  gameId: 'game_abc123',
  version: 'v1',
  status: 'LOBBY',
  startedAt: Date.now(),
  lastSavedAt: Date.now(),
  
  players: new Map<PlayerId, Player>([
    {
      playerId: 'p0',
      name: 'You',
      seatPosition: 1,
      team: 'RED',
      partnerId: 'p2',
      hand: [], // Cards dealt during DEALING phase
      isHuman: true,
      isBot: false,
      bid: null,
      tricksWonThisRound: 0,
      pointsCapturedThisRound: 0,
    },
    {
      playerId: 'p1',
      name: 'Opponent 2',
      seatPosition: 2,
      team: 'BLACK',
      partnerId: 'p3',
      hand: [],
      isHuman: false,
      isBot: true,
      bid: null,
      tricksWonThisRound: 0,
      pointsCapturedThisRound: 0,
    },
    {
      playerId: 'p2',
      name: 'Partner',
      seatPosition: 3,
      team: 'RED',
      partnerId: 'p0',
      hand: [],
      isHuman: false,
      isBot: true,
      bid: null,
      tricksWonThisRound: 0,
      pointsCapturedThisRound: 0,
    },
    {
      playerId: 'p3',
      name: 'Opponent 4',
      seatPosition: 0,
      team: 'BLACK',
      partnerId: 'p1',
      hand: [],
      isHuman: false,
      isBot: true,
      bid: null,
      tricksWonThisRound: 0,
      pointsCapturedThisRound: 0,
    },
  ]),

  dealerId: 'p1',                // Random assigned
  
  biddingState: {
    phase: 'PRE_FIRST_DEAL',
    currentPlayerToBid: 'p2',    // Player left of dealer (clockwise)
    currentHighestBid: null,
    passesSinceLastBid: 0,
    allPlayersHavePassed: false,
    forcedBidTriggered: false,
    bids: new Map(),
  },

  bidWinnerId: null,
  trumpSuit: null,
  trumpFaceDown: true,
  trumpRevealedThisRound: false,
  
  currentTrickNumber: 0,
  currentLeadPlayerId: null,
  trickPile: [],
  
  redTeamScore: {
    points: 0,
    isFaceUp: false,
    scoreCards: Array(6).fill(null).map((_, i) => ({
      cardId: `red_${i}`,
      scoredAt: null
    }))
  },
  
  blackTeamScore: {
    points: 0,
    isFaceUp: false,
    scoreCards: Array(6).fill(null).map((_, i) => ({
      cardId: `black_${i}`,
      scoredAt: null
    }))
  },
  
  matchGoal: 12,
  
  stateHash: 'initial_placeholder_hash',
};
```

### 4.7 Dependencies (package.json)

```json
{
  "name": "thanni-indian-24-card-game",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 3000",
    "build": "tsc && vite build",
    "preview": "vite preview --port 4000",
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0",
    "peerjs": "^1.5.0",
    "framer-motion": "^10.16.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.3.0",
    "typescript": "^5.2.0",
    "vite": "^4.5.0",
    "vitest": "^0.34.0"
  }
}
```

---

## 5. Local AI Heuristics Engine

### 5.1 Architecture Overview

AI operates as a **rule-based heuristic engine** running entirely client-side. There are two primary subsystems:

1. **AIBidder**: Evaluates hand strength and calculates an optimal bid
2. **AICardPlayer**: Decides which card to play in tricks, accounting for trump logic

Both run synchronously within the game loop with a simulated delay (800ms–1500ms) to feel natural.

### 5.2 AIBidder — Hand Evaluation & Bidding Logic

#### 5.2.1 Card Strength Scoring

```typescript
// engine/AIBidder.ts

interface HandEvaluation {
  rawPointTotal: number;       // Sum of point values in hand
  adjustedScore: number;       // After applying modifiers
  highCardCount: number;       // A, K, Q count
  trumpStrength: number;       // Points in potential trump suit
  suitDistribution: Map<Suit, number>; // Cards per suit
  estimatedPoints: number;     // Final bid estimate
}

const CARD_POINTS: Record<CardValue, number> = {
  'J': 30,
  '9': 20,
  'A': 11,
  '10': 10,
  'K': 6,
  'Q': 5,
};

class AIBidder {
  /**
   * Evaluate a player's hand and return an estimated point total.
   * Called during BIDDING phase (after second deal of 6 cards).
   */
  static evaluateHand(hand: Card[]): HandEvaluation {
    let rawPointTotal = 0;
    let highCardCount = 0;
    const suitDistribution = new Map<Suit, number>();
    
    for (const card of hand) {
      rawPointTotal += CARD_POINTS[card.value];
      
      if (['A', 'K', 'Q'].includes(card.value)) {
        highCardCount++;
      }
      
      suitDistribution.set(
        card.suit,
        (suitDistribution.get(card.suit) || 0) + 1
      );
    }

    // Adjust for hand composition
    let adjustedScore = rawPointTotal;
    
    // Bonus for concentration in one suit (potential trump suit)
    const maxSuitCount = Math.max(...suitDistribution.values());
    if (maxSuitCount >= 4) {
      adjustedScore += 15; // Strong single suit bonus
    } else if (maxSuitCount >= 3) {
      adjustedScore += 8;
    }

    // Bonus for having multiple high cards (A, K, Q)
    if (highCardCount >= 4) {
      adjustedScore += 10;
    } else if (highCardCount >= 3) {
      adjustedScore += 5;
    }

    return {
      rawPointTotal,
      adjustedScore: Math.min(adjustedScore, 328), // Cap at max possible
      highCardCount,
      trumpStrength: 0,
      suitDistribution,
      estimatedPoints: this.calculateBid(adjustedScore),
    };
  }

  /**
   * Convert estimated points to a valid bid amount.
   */
  static calculateBid(estimatedPoints: number): number {
    const MIN_BEAT = 150;
    
    if (estimatedPoints < MIN_BEAT) {
      return MIN_BEAT; // Always at least "Beat"
    }

    // Round up to nearest valid increment
    const base = Math.ceil(estimatedPoints / 10) * 10;
    return Math.max(MIN_BEAT, base);
  }

  /**
   * Decide whether to bid or pass.
   * Returns: 'BID' with amount, or 'PASS'
   */
  static decideBidOrPass(hand: Card[], currentHighestBid: Bid | null): 
    { action: 'BID'; amount: number } | { action: 'PASS' } {
    
    const evaluation = this.evaluateHand(hand);
    const currentBid = currentHighestBid?.amount ?? 150;

    // Only bid if confidence is high enough above current bid
    const confidenceThreshold = currentBid * 1.15; // Need 15% margin
    
    if (evaluation.estimatedPoints >= confidenceThreshold) {
      return { action: 'BID', amount: evaluation.estimatedPoints };
    }

    return { action: 'PASS' };
  }
}
```

#### 5.2.2 Bidding Strategy Rules Summary

| Rule | Condition | Action |
|---|---|
| Minimum "Beat" (150) | Hand has < 150 estimated points but game must be bid | Force bid if all 4 players passed |
| Comfortable Bid | Estimated points ≥ current highest × 1.15 | Place bid at estimated points (rounded) |
| Pass | Estimated points < current highest × 1.15 | Pass (let opponents take the burden) |
| Aggressive Mode | Hand has J or 9 AND suit concentration ≥ 4 | Bid aggressively (+10–20 pts above estimate) |

### 5.3 AICardPlayer — Trick-Playing Logic

#### 5.3.1 Card Selection Algorithm

```typescript
// engine/AICardPlayer.ts

class AICardPlayer {
  /**
   * Determine which card the AI should play in a trick.
   * Considers: led suit, trump status, hand composition, trick position.
   */
  static selectCard(
    hand: Card[],
    validCards: Card[],       // Cards that are legally playable
    trickNumber: number,      // 1–6
    isLeading: boolean,       // Are we the lead player this trick?
    trumpSuit: Suit | null,   // Current trump (null = hidden)
    hasTrumpRevealed: boolean,
    tricksWonSoFar: number,   // Team's tricks this round
  ): Card {
    
    if (isLeading) {
      // LEADING: Play a high-value card to try to win the trick
      return this.selectLeadCard(hand, validCards, trumpSuit);
    } else {
      // FOLLOWING: Evaluate whether to follow suit, discard, or play trump
      return this.selectFollowCard(
        hand, validCards, trumpSuit, hasTrumpRevealed, trickNumber
      );
    }
  }

  /**
   * Select a card when LEADING a trick.
   * Strategy: Lead with high-point cards early, save trumps for later tricks.
   */
  private static selectLeadCard(
    hand: Card[],
    validCards: Card[],
    trumpSuit: Suit | null
  ): Card {
    // Sort valid cards by point value (descending)
    const sorted = [...validCards].sort((a, b) => 
      CARD_POINTS[b.value] - CARD_POINTS[a.value]
    );

    if (trumpSuit === null || !hand.some(c => c.suit === trumpSuit)) {
      // No trumps: lead highest non-point card first to minimize risk
      const noPointCards = sorted.filter(c => 
        !['A', 'J'].includes(c.value)
      );
      if (noPointCards.length > 0) {
        return noPointCards[noPointCards.length - 1]; // Lowest value, no points
      }
      return sorted[sorted.length - 1]; // Otherwise play lowest
    }

    // Have trumps: lead highest non-trump to force others to follow
    const nonTrumps = sorted.filter(c => c.suit !== trumpSuit);
    if (nonTrumps.length > 0) {
      return nonTrumps[0]; // Highest non-trump
    }

    // Only trumps: lead lowest trump (save high trumps for later)
    return sorted[sorted.length - 1];
  }

  /**
   * Select a card when FOLLOWING to a led suit.
   */
  private static selectFollowCard(
    hand: Card[],
    validCards: Card[],
    trumpSuit: Suit | null,
    hasTrumpRevealed: boolean,
    trickNumber: number
  ): Card {
    
    // TRUMP REVEAL RULE: If trump is revealed and player has trumps, MUST play one
    if (hasTrumpRevealed && trumpSuit !== null) {
      const trumpsInHand = hand.filter(c => c.suit === trumpSuit);
      const playableTrumps = validCards.filter(c => c.suit === trumpSuit);
      
      if (playableTrumps.length > 0) {
        // Must play a trump — choose optimally
        if (trickNumber <= 2) {
          // Early tricks: play lowest trump (save strength)
          return playableTrumps.sort((a, b) => 
            CARD_POINTS[a.value] - CARD_POINTS[b.value]
          )[0];
        } else {
          // Later tricks: may need to play high trump to win
          return playableTrumps.sort((a, b) => 
            CARD_POINTS[b.value] - CARD_POINTS[a.value]
          )[0];
        }
      }
      // Void of trumps: can discard any valid card
    }

    // Not following suit (void in led suit) or Trump override above didn't apply
    // Decide: try to win OR discard based on game context
    const highestLed = this.estimateHighestCardInTrick(validCards, hand);
    
    if (highestLed === null) {
      // Cannot win: discard lowest-value card
      return validCards.sort((a, b) => 
        CARD_POINTS[a.value] - CARD_POINTS[b.value]
      )[0];
    }

    // Can potentially win: play the card that wins with highest value (efficiency)
    return highestLed;
  }

  /**
   * Estimate if we can win the current trick.
   * Simplified: assumes no other trumps unless trump is revealed.
   */
  private static estimateHighestCardInTrick(
    validCards: Card[],
    hand: Card[]
  ): Card | null {
    // Sort by point value (proxy for trick strength in simplified model)
    const sorted = [...validCards].sort((a, b) => 
      CARD_POINTS[b.value] - CARD_POINTS[a.value]
    );
    return sorted.length > 0 ? sorted[0] : null;
  }
}
```

#### 5.3.2 AI Decision Flowchart

```
AI Player's Turn:
  │
  ▼
Is this a BIDDING turn?
  │
  ├── YES → Evaluate hand (from 4 or 6 cards)
  │          ├── Calculate estimated point total
  │          ├── Compare with current highest bid × 1.15
  │          ├── If above threshold → Place bid at calculated amount
  │          └── Else → Pass
  │
  └── NO → Is this a TRICK-PLAYING turn?
             │
             ├── Are we LEADING the trick?
             │    ├── YES: Select highest-value legal card (or lowest non-point if no trumps)
             │    └── Consider: Save high trumps for later tricks
             │
             └── Are we FOLLOWING to a led suit?
                  ├── Trump revealed AND have trumps? → MUST play trump (lowest first in early tricks)
                  ├── Can win trick? → Play winning card (highest efficient winner)
                  └── Cannot win? → Discard lowest-value card
```

### 5.4 AI Difficulty Tiers (Optional Future Enhancement)

| Tier | Bidding Behavior | Trick-Playing Behavior |
|---|---|---|
| **Easy** | Bids randomly; passes often | Plays highest card always; ignores trump logic |
| **Medium** (Default) | As described above | Follows rules but makes occasional suboptimal plays (~15% error rate) |
| **Hard** | Aggressive bidding with margin analysis | Always plays optimally; remembers opponent's played cards |

---

## 6. Complex Edge Cases

### 6.1 Player Disconnect / Reconnect Handling

| Scenario | Behavior | Resolution |
|---|---|---|
| **Human disconnects during BIDDING** | Their seat shows "⏳ Waiting..." for up to 30 seconds | If no reconnect → auto-pass; game continues |
| **Human disconnects during TRICK-PLAYING** | Turn held for 15 seconds, then auto-played by AI using last known strategy | Score still applies to their team |
| **Human disconnects entire round** | Game holds state; if reconnects within 24h → resume from last saved state | If > 24h → offer "Continue with AI proxy" |
| **Host disconnects** | ⚠️ Critical issue — host is authoritative | Other players get prompt: "Make Host" / "End Game" / "Retry Connection (30s)" |
| **Partner disconnects (non-host)** | Bot takes over for partner; human continues | When partner reconnects → sync latest state; bot resumes control |
| **Full page refresh** | localStorage persistence handles recovery | On reload → show "Resume Game" banner; auto-restore if valid |

#### 6.1.1 Disconnect State Machine

```
[PLAYER_CONNECTED]
       │
       ▼ (10s no PONG response)
[PLAYER_WARNING] ──── Show warning to disconnecting player: 
                            "Connection unstable. Please stay."
       │
       ▼ (15s more, total 25s)
[PLAYER_DISCONNECTED]
       │
       ├── If human and turn pending → Auto-play with default card
       ├── If not human → Bot takes over seat
       └── If host → Trigger HOST_TRANSFER prompt for other players
       │
       ▼ (Reconnect attempted)
[RESUME_REQUESTED]
       │
       ├── Host sends full state snapshot
       ├── Player restores state from snapshot
       └── Resume normal play
```

### 6.2 State Synchronization on Trump Reveal

This is a **critical edge case** because trump reveal changes gameplay rules mid-round, and all players must have consistent state.

#### 6.2.1 Trump Reveal Flow (Detailed)

```
1. Player X (whose turn it is to play) clicks "Reveal Trump" button.
   └── This button is only visible if:
       ├── Trump has been set (face-down)
       └── Player has NOT requested reveal this round yet

2. Host validates:
   ├── Is trumpFaceDown === true? ✓
   ├── Has this player already revealed? ✗ (first time only)
   └── Is game status 'PLAYING' or 'TRUMP_SET'? ✓

3. Host applies changes:
   ├── trumpFaceDown = false
   ├── trumpRevealedThisRound = true
   ├── trumpSuit = <actual suit value>
   └── Increment message sequenceNumber for broadcast

4. Host broadcasts STATE_SNAPSHOT to all peers:
   {
     trumpSuit: 'SPADES',       // NOW REVEALED
     trumpFaceDown: false,       // No longer hidden
     trumpRevealedThisRound: true,
     sequenceNumber: 47          // Updated for sync
   }

5. All peers update local state:
   ├── Display trump card face-up in center zone
   ├── Show notification: "♠ SPADES have been revealed as Trump!"
   └── For the revealing player:
       ├── Check hand for Spades
       ├── If has Spades: highlight them, must play one
       └── If void of Spades: can discard any card

6. Revert check (if a peer's state is stale):
   ├── Peer compares sequenceNumber
   ├── If lower → accept new state entirely
   └── If higher → ignore (outdated snapshot)
```

#### 6.2.2 Race Condition: Trump Reveal + Trick Evaluation

```
EDGE CASE: What if a player reveals trump, but another player has already
           played a card that would have won the trick IF trump wasn't revealed?

RULE: All cards are evaluated AFTER final state (including trump reveal) is applied.
      The trick is NOT evaluated until all 4 players have played.
      
Resolution:
  1. Player A plays a Spade (Trump) — but this is only visible after all play
  2. Player B reveals trump (Spades)
  3. Player C plays a Heart (non-trump)
  4. Player D plays a Club (non-trump)
  5. Trick evaluates: Spade > Hearts/Clubs → Player A wins
  
  This is correct behavior — the trump reveal doesn't retroactively undo 
  previously played cards. All 4 cards are in the trick pile and evaluated together.
```

### 6.3 Forced Bid Edge Case

```
SCENARIO: All 4 players pass during bidding.

BEHAVIOR:
  1. Player 0 (first to speak) is FORCED to bid "Beat" (150).
  2. This triggers immediately after the 4th pass.
  3. UI shows: "All opponents passed. You are forced to bid Beat (150)."
  4. The bid auto-applies after a 1-second delay.
  5. Bidding closes; trump suit is determined.

TRUMP SELECTION IF FORCED BID:
  - If Player 0 is human → they choose trump from their hand
  - If Player 0 is bot → AI selects trump optimally (most cards, highest points)

EDGE CASE: What if the forced "Beat" bidder has no cards?
           (Theoretically impossible in a 24-card, 6-card-hand game, but guard anyway.)
  → If hand is empty after deal → reshuffle remaining deck; re-deal.
```

### 6.4 Score Edge Cases

#### 6.4.1 Score Exceeding Match Goal

```
SCENARIO: A team scores a point that takes them beyond 12 points (e.g., from 10 to 12+2).

RULE: The match goal is 12. Any score above 12 still counts, but the match ends 
      as soon as any team reaches >= 12.

Example:
  Red Team: 10 points
  Black Team bids 180 and FAILS to meet it.
  Black Team gets +2 → becomes 12 points.
  → Match ends. Red Team wins (even if Black was also at 11, Red hits 12 first in 
     the same resolution).

If BOTH teams reach >= 12 on the same round (theoretically impossible in this game's 
scoring system):
  → The team with higher total wins.
  → If equal: it's a draw; offer "Play Tiebreaker Round".
```

#### 6.4.2 Face-Down Team Receiving Points

```
SCENARIO: Red Team's card is face-down. Black Team scores +2 points against Red.

RULE (from PRD Section 2.4):
  "If the bidding team FAILS to meet their bid: The opposition gets +2 points 
   (applied to their face-up score or reducing the bidding team's score depending on status)."

Application:
  - Black Team (opposition) scores +2.
  - Red Team (bidding team, face-down) → Their score remains 0 (cannot go negative).
  - The +2 is "banked" as a pending point for Black.
  - When Red's card flips face-up, the pending points are applied first.

PENDING POINTS MECHANIC:
  interface TeamScore {
    points: number;           // Active match points
    pendingPoints: number;   // Banked points waiting to be applied
  }

  When Red's card finally turns face-up (by Red scoring their own point):
    - Red gets +1 (for scoring)
    - Red's pendingPoints from Black are NOT subtracted (they apply to Black's score)
    
  Actually, per rules: the -2 goes to the BIDDING TEAM's score (reducing it).
  So if Red goes from 0 → face-up, their score is 0 (cannot go below 0).
```

#### 6.4.3 Dealer Rotation with Face-Down Constraint

```
SCENARIO: Both teams' cards are face-up. One team wins the round.

RULE: The team whose card is currently FACE DOWN must deal until their card turns face-up.

Implementation:
  After each round:
    if (redTeam.isFaceUp && !blackTeam.isFaceUp) {
      // Black must deal → dealer rotates to next Black player
      dealerId = getNextPlayerInClockwise(blackTeam);
    } else if (!redTeam.isFaceUp && blackTeam.isFaceUp) {
      // Red must deal → dealer rotates to next Red player
      dealerId = getNextPlayerInClockwise(redTeam);
    } else {
      // Both face-up OR both face-down: normal clockwise rotation
      dealerId = getNextPlayerInClockwise(currentDealer);
    }

EDGE: What if a team scores and their card flips face-up DURING the same round 
       where they are required to deal because it was face-down?
  → Their card is now face-up. The "must deal" rule no longer applies.
  → Dealer rotates normally (clockwise) for subsequent rounds.
```

### 6.5 State Recovery After Browser Crash

```
RECOVERY FLOW:
  1. User returns to game tab.
  2. App loads (from service worker cache if offline).
  3. On mount, check localStorage:
     ├── Found valid state with timestamp < 24 hours ago?
     │    └──▶ Show "Resume Game" button. On click → restore state.
     ├── Found state older than 24 hours?
     │    └──▶ Show warning; offer to resume or start fresh.
     └── No state found?
          └──▶ Show new game lobby.

STATE CORRUPTION HANDLING:
  - If hash verification fails:
    ├── Log error event (local only, no network call).
    ├── Attempt to load from sessionStorage fallback.
    ├── If fallback also fails → show "Game state corrupted. Start new game?"
    └── Offer to save current match result as a "stat" before clearing.

DATA PRESERVATION DURING CRASH:
  - Auto-save every 5 seconds during active play (throttled).
  - On window.beforeunload, immediate synchronous save.
```

### 6.6 Concurrent Action Edge Cases

| Case | Handling |
|---|---|
| **Two players click "Play" simultaneously** | Host processes in order of message receipt timestamp. First comes first served. |
| **Invalid card played (not in hand)** | Host rejects; sends `ACTION_FAILED` message; player must select another card. |
| **Bid amount below current highest** | Front-end validation prevents submission; shows error toast: "Bid must be higher than 170". |
| **Trump suit chosen is not in player's hand** | AI can choose any suit (not restricted to hand suits). Human is only shown suits they hold. |
| **Trick evaluated with cards already removed** | Guard: trickPile.length === 4 before evaluation. If not, wait for all 4 cards. |

### 6.7 Accessibility Edge Cases

| Case | Handling |
|---|---|
| **Screen reader on game table** | All cards have `aria-label` ("Ace of Spades"). Scoreboard has live region announcing scores: "Red Team: 2 points, Black Team: 1 point." |
| **Keyboard-only navigation** | Tab order: Scoreboard → Opponent areas → Center trick → Your hand → Play button. Enter/Space to interact. |
| **Color blindness (red-green)** | All suits have distinct symbols (♥ ♦ ♠ ♣). Card values use text, not just color. Trump highlight uses gold border + icon, not just color. |
| **Reduced motion preference** | `@media (prefers-reduced-motion: reduce)` disables all CSS animations including card flips and deal animations. |

### 6.8 Performance Edge Cases

| Case | Mitigation |
|---|---|
| **Large hand display on mobile (6 cards in narrow view)** | Cards rendered with `overflow-x: auto` horizontal scroll; slight overlap (70% visibility of next card). |
| **Memory usage with many state snapshots** | Only one snapshot stored in localStorage (latest). No history of past states. Garbage collection runs on round end. |
| **Service worker offline behavior** | Service worker caches all static assets (HTML, JS, CSS, fonts). Game is fully playable offline after first load. PWA installable. |

### 6.9 Bid Terminology Edge Cases

| Term | Representation | Edge Case |
|---|---|---|
| **Beat** | `150` — Minimum | If forced (all pass), auto-applied with 1s delay and message: "Forced to bid Beat" |
| **John** | `200` | Displayed as "John" in bidding panel, but stored internally as 200 for comparison |
| **John 10** | `210` | Displayed as "John 10" (not "210") |
| **John 20** | `220` | Displayed as "John 20" |
| **Above John** | `230+` | Displayed numerically: "230", "240", etc. — no more "John" naming |

**Terminology Mapping Function:**

```typescript
function getBidDisplayName(amount: number): string {
  if (amount === 150) return 'Beat';
  if (amount === 200) return 'John';
  if (amount === 210) return 'John 10';
  if (amount === 220) return 'John 20';
  
  // 160 → "60", 170 → "70" (abbreviated display)
  if (amount >= 160 && amount < 200) {
    return String(amount - 100); // 160 → "60", 170 → "70"
  }
  
  return String(amount); // Default: full number
}
```

### 6.10 Match Goal Verification

```
GOAL CHECK AFTER EACH ROUND:
  After scoring is applied:
  
  if (redTeamScore.points >= 12) {
    status = 'MATCH_OVER';
    winner = 'RED';
    triggerGameOverAnimation('RED');
  } else if (blackTeamScore.points >= 12) {
    status = 'MATCH_OVER';
    winner = 'BLACK';
    triggerGameOverAnimation('BLACK');
  } else {
    // Continue to next round
    rotateDealer();
    resetHandForNewRound();
    status = 'LOBBY'; // Brief pause before new dealing begins
  }

EDGE: Can a team score negative points?
  ANSWER: No. Scores only increase or decrease within bounds [0, ∞).
          A face-down team's score cannot go below 0.
          Points are "banked" as pending if the target is face-down.

EDGE: Can both teams reach 12 in the same round?
  ANSWER: Theoretically impossible per game rules. Scoring is one-directional 
          (either bidding team scores OR opposition scores, not both).
```

---

## Appendix A: Complete Card Point Reference

| Card | Points | Per Suit % of Total |
|---|---|---|
| J | 30 | 36.59% |
| 9 | 20 | 24.39% |
| A | 11 | 13.41% |
| 10 | 10 | 12.20% |
| K | 6 | 7.32% |
| Q | 5 | 6.10% |
| ─── | ── | |
| **Per Suit Total** | **82** | **100%** |
| **4 Suits Total** | **328** | **100%** |

---

## Appendix B: Glossary of Terms

| Term | Definition |
|---|---|
| **Beat** | Minimum bid of 150 points; also the forced bid if all players pass |
| **Bid** | An offer to win at least X points in tricks during the round |
| **Deal** | Distribution of cards to players (two deals: 4 cards, then 2 more) |
| **Dealer** | The player who distributes cards; rotates per rules |
| **Follow Suit** | Playing a card of the same suit that was led to the trick |
| **Hand** | The cards currently held by a player (6 cards each after second deal) |
| **Host** | The player whose browser runs the authoritative game state |
| **John** | Terminology for a 200-point bid |
| **Lead** | To play the first card to a trick |
| **Match Goal** | 12 match points; first team to reach wins the game |
| **Partner** | The teammate sitting opposite you (diagonal on the table) |
| **Pass** | Declining to bid; commits you to support your partner's eventual bid |
| **Point** | A match point tracked via the 6-card deck scoreboard |
| **Reveal** | To turn the face-down trump card face-up, exposing the suit |
| **Round** | One complete game from dealing to scoring |
| **Suit** | One of four categories: ♥ Hearts, ♦ Diamonds, ♠ Spades, ♣ Clubs |
| **Take / Capture** | To win tricks and collect cards this round |
| **Trump** | A suit that beats all other suits for the duration of the round |
| **Trick** | One play of 4 cards (one per player); winner leads next trick |

---

## Appendix C: File Structure Summary

```
thanni/
├── public/
│   ├── manifest.json
│   └── favicon.ico
├── src/
│   ├── game/
│   │   ├── types/         # All TypeScript interfaces & enums
│   │   ├── store/         # Zustand stores (game, UI, audio)
│   │   ├── engine/        # Pure logic: DeckBuilder, Dealer, Bidder, Evaluator, Scorer
│   │   ├── ai/            # AIBidder, AICardPlayer
│   │   └── persistence/   # StateSerializer, StateHasher, StorageAdapter
│   ├── components/        # All React UI components
│   ├── hooks/             # Custom React hooks
│   ├── utils/             # Constants, helpers, analytics
│   └── styles/            # Global CSS, Tailwind config, animations
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

*Document End — PRD Version 1.0.0*
*Total Pages: 1 (Comprehensive Single Document)*
*All point math verified: 328 total points per round ✓*
*Architecture confirmed: Client-side only, no backend database ✓*