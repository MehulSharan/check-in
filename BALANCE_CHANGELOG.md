# Balance Changelog

Every value change made to the card database after simulating bot-vs-bot
matches, with the data that motivated it. **All changes are suggestions** —
the whole team should review; reverting any of them is a one-number edit in
`js/data/cards.js`.

Method: `node tools/sim.js 500` — 500 games, 3 optimal-showdown bots per
game, 3 rounds each → 4,500 scored hands. Bots trade with the configured
probability and reroll otherwise, so trade/score numbers reflect realistic
demo play, not just cold math.

---

## 2026-11-07 — first balance pass (MVP baseline)

### Changed

| Card | Before | After | Why |
|---|---|---|---|
| T12 Pomodoro Study Technique | +9 Chips | **+11 Chips** | Played **31 times in 4,500 hands** — effectively absent from the game. Pure-vanilla ACADEMIC self-care is strictly dominated (three symptoms debuff ACADEMIC chips, no symptom rewards them). Still below T01 Sleep (+12) so it stays a situational pick, not a default. |
| T14 Clean Desk & Organize Notes | +10 Chips | **+12 Chips** | Same disease (72 plays), slightly milder. Now ties T01 Sleep as the biggest pure chip card; Sleep keeps the edge via BODY synergies (S04 recognition, T17/T24 pairings). |

**Effect after re-simulation (500 games):** T12 31 → **85 plays**, T14 72 →
**185 plays**. ACADEMIC self-care is now "situational" instead of "dead",
which matches the intended lesson: studying helps on calm boards, fails
under burnout/exhaustion symptoms.

### Reviewed and deliberately KEPT (with data)

- **WILD professional-help cards top the chart** (T22 Counselling & T23
  Helpline ≈ 1,290 avg hand score vs ~1,000 field). This is the game's
  thesis — *when things are serious, professional help is the strongest
  move* — so they are supposed to be premium. No change.
- **S02 Pre-Exam Panic is the harshest symptom** (−197 avg hand score when
  on the board; next harshest ≈ −30). Kept at −5 Chips because the penalty
  is **symmetric** — every player at the table faces the same board, so it
  lowers the round's temperature without unfairness, and panic *should*
  feel disruptive. Watch-item: if playtests feel bad, soften to −4.
- **Help-seeking is near-mandatory** (99.4% of hands play ≥1 help card;
  8.3% go all-help, 0.6% all-self-care). Working as designed — S05/S07
  exist to teach "self-care alone caps your recovery". If the meta ever
  feels too solved, the lever is S05's cap (15) and S07's lock (1×).
- **Trades per game: 4.7 of ~12 possible** — the social mechanic is alive
  without dominating. No change to Trade_Bonus (+2 Mult, max 2 stacks).
- **Round scores are flat** (~1,080 / 1,077 / 1,032). Fine for the MVP
  (no ante escalation in the design); a future "boss round" could raise
  the stakes if the team wants drama.

### Interpretation rulings encoded during this pass (no value changes)

These were ambiguities in the spec, resolved in code + tests + README:

1. **T24 Medical / Health Centre** — "+4 Mult if played with at least one
   BODY card" is implemented as *another* BODY card (its own suit doesn't
   self-satisfy); otherwise the "+2 Mult otherwise" branch would be dead
   text.
2. **T20 Personal Tutor** — "ignores all ACADEMIC debuffs" = debuffs from
   **ACADEMIC-category symptoms** (S01 Burnout, S05 Imposter). S06 is a
   SOCIAL symptom and S04 a BODY symptom, so their penalties still apply.
3. **T22 Counselling** — clears **chip-type** debuffs only (S01, S02, S04,
   S06, S08, S09); mult debuffs (S03 −2, S07 lock) still apply, per the
   card's own wording "Chip penalties".
4. **S01 Burnout** — zeroed ACADEMIC cards contribute **0 chips total**
   (base + own bonus), the harshest reading of "give 0 Chips".
5. **S08 Doomscrolling** — "first card played" = first in the player's
   **selection order** (shown as badge 1 in the UI); bots automatically
   sacrifice their cheapest card first.
6. **WILD suit** — counts as **one** suit of the engine's choosing,
   picked to maximize the hand's score (brute-forced; a "counted as SOCIAL"
   line appears in the score breakdown). Professional-help recognition
   (S09) checks the card's *defined* suit, so it fires regardless.
