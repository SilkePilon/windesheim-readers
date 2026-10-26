<img src="assets/icon.svg" width="64" height="64" alt="">

# Windesheim Readers

Learn a course reader through AI-generated study material and game mechanics. Admins upload a reader PDF. The AI splits it into lessons (`1.2A`, `1.2B`, …) and generates study content. Students then practise with flashcards, quizzes, an AI tutor and live quiz battles.

## Features

**For students** (mobile-first, works on desktop)
- **Summary**: an AI summary per lesson with key points and a searchable glossary of key terms.
- **Flashcards**: spaced repetition with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) (like Anki), plus a daily review queue across all lessons.
- **Quiz**: multiple choice, true/false, fill-in-the-blank and ordering of process steps, with instant feedback. Scoring happens server-side.
- **Explain it (Feynman)**: explain a concept in your own words and get AI feedback and a score.
- **Open questions**: AI-graded against a rubric, with a model answer.
- **AI tutor**: a streaming chat grounded in the lesson's pages of the reader.
- **Quiz Battle**: live, Kahoot-style multiplayer over WebSockets with a 6-digit code, speed bonus and podium. It has a presentation mode for a projector.
- **Gamification**: XP, levels, daily streak, daily goal, badges, mastery % per lesson, and weekly plus all-time leaderboards. The leaderboard supports opt-out and nicknames.
- Dutch / English UI, light / dark theme.

**For admins**
- Upload a PDF. Text is extracted, and AI proposes the lesson split. The admin reviews and edits codes, titles, weeks and page ranges.
- Generate content for all lessons, missing ones or a single lesson. Edit or delete generated summaries, cards, questions and terms.
- AI settings: choose a provider and model for **generation** (heavy) and **tutor/grading** (fast). Supported providers are Gemini, Claude, OpenAI and OpenRouter. API keys are stored AES-GCM encrypted, and each model choice has a test button.
- Publish/unpublish readers, and promote users to admin.

**Auth**: email magic link only (this verifies the address). Sign-up is limited to `@windesheim.nl` and `@student.windesheim.nl`.

## Stack

React 19 + Vite + Tailwind v4 + shadcn/ui · Hono on Bun · SQLite (bun:sqlite) + Drizzle · better-auth (magic link) · Vercel AI SDK v7 · Resend · ts-fsrs

## Development

```bash
bun install
cp .env.example .env     # set APP_SECRET and ADMIN_EMAILS
bun run dev              # API on :3000, web on http://localhost:5173
```

Without `RESEND_API_KEY`, magic links are printed in the API console. After signing in as an admin, open **Admin → AI settings**, add an API key and pick models. Then upload a reader.

Migrations run automatically on start. After changing `server/db/schema.ts`, run `bun run db:generate`.

## Production

```bash
docker build -t windesheim-readers .
docker run -p 3000:3000 -v readers-data:/app/data --env-file .env windesheim-readers
```

Set `APP_URL` to the public URL and `APP_SECRET` to a long random string. The SQLite database and uploaded PDFs live in `/app/data`. Generation jobs, battles and quiz sessions run in-process, so run a single instance.

## Learning design

The design is based on evidence about what works for studying:
- **Retrieval practice + spacing** are the most effective study techniques (Dunlosky et al. 2013; replicated by Donoghue & Hattie 2021). That's why flashcards use FSRS scheduling and the home screen centres on the daily review.
- **Elaboration / self-explanation** is covered by the "Explain it" mode with AI feedback.
- **Gamification** helps on average but varies a lot, and leaderboards can demotivate some students. So the main leaderboard resets weekly, users can hide themselves, quiz XP decreases after repeated attempts, and progress is shown as personal mastery rather than only rank.
