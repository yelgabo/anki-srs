# anki-srs

**Stop re-grinding the same LeetCode problems and forgetting them a week later.**

anki-srs is a spaced-repetition trainer for coding interviews. It shows you the right problem at the
right time — just before you'd forget it — so the patterns actually stick. Work through the curated
NeetCode 150, build your own sets, and keep a daily habit that compounds.

## Why it works

Cramming 50 problems in a weekend feels productive and fades by Monday. Spaced repetition flips that:
you review each problem at growing intervals (1 day, then 3, then a week, then a month…), and every
time you recall the approach, the next review pushes further out. The problems you find hard come
back often; the ones you've mastered get out of your way. It's the Anki method, built specifically
for coding-interview prep.

## What you get

- **A curated NeetCode 150 deck, ready on day one.** Sign up and start studying the patterns that
  actually show up in interviews — no setup, no importing.
- **Smart scheduling that adapts to you.** Each review is graded *Again / Hard / Good / Easy*, and
  the algorithm schedules the next one based on how well you knew it. Hard problems resurface; easy
  ones space out.
- **Daily streaks with built-in forgiveness.** Keep a streak going, earn a weekly badge for staying
  consistent — and if life gets in the way, up to two "freezes" a month automatically cover a missed
  day so one slip doesn't wipe out weeks of momentum.
- **A fast, keyboard-driven review loop.** Reveal with **Space**, grade with **1–4**, skip with
  **s**. Blow through a session without touching the mouse.
- **Undo, instantly.** Fat-fingered a grade? Undo restores the card exactly as it was — no harm done.
- **A daily cap so you don't burn out.** Reviews are capped (default 50/day) to keep sessions
  sustainable, with a one-click "review them anyway" when you're feeling it.
- **Build your own decks.** Create named groups, add your own problems, and write the prompt and your
  preferred approach in your own words. Make a copy of the curated set and edit it to match how *you*
  think.

## How to use it

1. **Sign up** with an email and password.
2. **Open Today** to see what's due. Hit **Start session**.
3. **Recall the approach**, reveal the answer, and grade yourself honestly — *Again* if you blanked,
   *Easy* if it was instant.
4. **Come back tomorrow.** That's the whole trick: a little every day beats a weekend binge.

Your progress is private to your account, even for shared decks — what you've mastered is yours.

## Try it / run your own

Want to host your own instance? It's an open codebase you can clone and run:

```bash
cp .env.example .env          # set DATABASE_URL + AUTH_SECRET
npm install
npx prisma db push && npm run db:seed
npm run dev                   # http://localhost:3000
```

You'll need a PostgreSQL database. Full setup, architecture, and the engineering details live in
**[TECHNICAL.md](./TECHNICAL.md)**.

---

*Built with Next.js, Prisma, and the SM-2 spaced-repetition algorithm.*
