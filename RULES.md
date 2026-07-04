<!-- Thanni rules — also rendered in the in-app Rules modal. Edit this file; the modal reads it via Vite's `?raw` import. -->

## Players & Teams

- 4 players form 2 fixed teams: **RED** (You + Arjun, North/South seats) vs **BLACK** (Vikram + Priya, East/West seats).
- Teammates sit across from each other. The seat that deals rotates based on who is trailing.

## The Deck & Point Values

- 24-card deck: 4 suits (♥ ♦ ♠ ♣) × 6 values: A, K, Q, J, 10, 9.
- **Point values:** J = 30 · 9 = 20 · A = 11 · 10 = 10 · K = 6 · Q = 5.
- Total points in play each round: **328**.

## Round Flow

1. Dealer deals **4 cards** to each player (16 of 24 cards).
2. Bidding phase: players bid on how many points their team commits to win.
3. Highest bidder picks the **Trump suit** by selecting a card from their hand and placing it face-down.
4. Remaining **2 cards** are dealt (now 6 cards each).
5. Six tricks are played — player to the left of dealer leads trick #1. Trick winner leads the next.
6. After 6 tricks, the round is scored and the match balance shifts.
7. First team to push the differential to **+12** or **−12** wins the match.

## Bidding

- **Beat (150)** is the minimum bid. If all 4 players pass, the first bidder is forced to bid Beat.
- Bids go up in 10s: 150 → 160 ("60") → 170 ("70") → 200 ("John") → 210 ("John 10") → 220 ("John 20") → up to 328.
- Bidding ends when 3 players pass after someone has bid. That bidder's team wins the contract.
- You can only bid higher than the current highest bid.

## Thanni (the solo all-tricks bid)

- A player may bid **Thanni** only as their *first action* this round — passing or bidding any other amount removes the option for that player.
- A Thanni bid ends bidding immediately. The phase-2 deal and trump selection are skipped — only the original **4 phase-1 cards** are played, in **4 tricks**, with **no trump**.
- The Thanni bidder's **partner is folded** and does not play. The bidder plays solo 1-vs-2 against the two opponents and must **win all 4 tricks**.
- The Thanni bidder **leads every trick** (since they must win each one).
- **Make** (win all 4 tricks): the bidding team gains **+4 match points**.
- **Miss** (lose any trick): the opposition gains **+8 match points** — a swing of 8 against the bidding team (the +8 first negates any positive balance the bidding team held, then overflows into the opposition's side).
- Thanni is *disallowed* if the bidder's 4 cards **guarantee** a sweep against every possible opponent deal — the bid must carry genuine risk (at least 1%).

## Hath Band (the post-bid solo all-tricks call)

- After bidding completes, all 6 cards are dealt, and the trump is chosen — but **before the first card is played** — any player may call **Hath Band**.
- The caller's **partner is folded** and does not play. The caller plays solo 1-vs-2 against the two opponents and must **win all 6 tricks** (losing any trick ends the round immediately).
- The caller **leads every trick** (since they must win each one).
- When Hath Band is called, the chosen **trump is discarded** entirely — the round is played with **no trump**, and the physical trump card the bid winner set aside is returned to the bid winner's hand (regardless of whether the bid winner ends up folded, e.g. if the bid winner's partner called).
- **Any player can call Hath Band** — including a member of the opposition (a "stolen contract"). If the opposition caller misses, the original bid winner's team gains the differential swing.
- The original bid winner's bid contract is **fully overridden** by a Hath Band call — no secondary scoring event for the original bid is computed.
- **Make** (win all 6 tricks): the caller's team gains **+6 match points**.
- **Miss** (lose any trick): the opposition gains **+12 match points** — a swing of 12 against the caller's team.
- Hath Band is *disallowed* if the caller's 6 cards **guarantee** a sweep — i.e., every one of the caller's 6 cards has no possible beater (no opponent holds a same-suit card with a higher point value). The call must carry genuine risk (at least 1%).

## Trick Play

- You **must follow the led suit** if you have a card of that suit.
- If you cannot follow suit, you may either play any card or request the **Trump Reveal**.
- Trick winner = highest card of the led suit, unless a trump was played (then highest trump wins).
- In a Thanni round there is no trump, so the highest card of the led suit always wins, and only 3 players play each trick (the partner is folded).

## Trump Reveal (special mechanic)

- The trump card remains **face-down** at the start of the round — its suit is hidden from everyone.
- Once per round, a player who cannot follow suit may request the reveal: the card turns face-up and is **returned to the bid winner's hand**.
- The player who requested the reveal **MUST play a trump** if they have one after the reveal.
- After a reveal, the trump suit is public knowledge for the rest of the round.
- There is **no trump** in a Thanni round, so this mechanic never applies there.

## Scoring (Match Points — Tug-of-War)

The match uses a single signed **balance**: positive means **RED** leads by that many, negative means **BLACK** leads by `|balance|`. Both teams can *never* be in positive territory at the same time.

- Any scoring event shifts the balance toward the gaining team by the gain amount. The gain first negates any positive balance the other team holds, then overflows into the gaining team's side. Example: if RED is leading by +1 and BLACK gains 2, the new balance is **−1** (BLACK leads by 1).
- **Standard bid (Beat, "60", "70" — below 200):**
  - Team **makes** the bid: balance shifts +1 toward the bidding team.
  - Team **misses**: balance shifts 2 toward the opposition.
- **High-value bid (John / John 10 / John 20 — 200+):**
  - Team **makes** the bid: balance shifts +2 toward the bidding team.
  - Team **misses**: balance shifts 4 toward the opposition.
- **Thanni bid:**
  - Team **makes** (win all 4 tricks): balance shifts +4 toward the bidding team.
  - Team **misses**: balance shifts 8 toward the opposition.
- **Hath Band call:**
  - Caller **makes** (win all 6 tricks): balance shifts +6 toward the caller's team.
  - Caller **misses** (loses any trick): balance shifts 12 toward the opposition.
- First team to push the balance to **+12** (RED) or **−12** (BLACK) wins the match.

## Scoreboard

- The scoreboard displays the single differential balance: the leading side shows its lead in positive points; the trailing side always reads **0**.
- A team's scoring card flips **face-up** the first time it ever takes a positive lead (a visual affordance only — it does not gate where points are applied).
- Dealer rotation follows the trailing team: the team at 0 keeps dealing until they score and the balance flips back their way. Once both teams have been in positive territory, the dealer rotates clockwise each round.

## Winning

- The first team to reach **12 match points** of differential lead wins the match.
- Tap the trophy card next to your hand to review tricks your team has won this round.