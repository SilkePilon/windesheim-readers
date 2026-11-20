# Learn the whole reader

Date: 2026-11-20. Size: project. Order of jobs: About → feedback → speed → **whole-reader learning**.

## Intent
Lessons teach one piece of a reader at a time, but the exam tests the whole reader. Students need one place that takes them through all of it until the exam. Each day it tells them what to do (short, mixed and spaced), shows how far they are and how long until the exam, lets them listen to a long, interesting episode per week, and shows how the ideas connect. It uses good learning techniques: spaced repetition, interleaving, retrieval practice, elaboration ("explain it"), and dual coding (the concept map).

## Goals
- **One page per reader** (`/reader/:id`) that adapts to the moment: overview, today's session and exam prep.
- **Entry:** a "Learn the whole reader" card on home, above the lesson path (world map), for the selected reader.
- **First view:** today's session as a big start button, the exam countdown (from an exam date the admin sets per reader), and progress. The concept map and the episodes sit below.
- **Daily session** (about 15 minutes), mixed:
  - due FSRS flashcards from the whole reader;
  - interleaved quiz questions weighted towards weak lessons;
  - 1–2 "explain it" questions graded by AI.
- **A spaced plan towards the exam date:** the closer the exam, the more cards that would otherwise come back after the exam are pulled forward, and the more weight goes to weak lessons.
- **Weekly episodes:** one audio episode of about 15 minutes per `lesson.week`. They are generated in the admin pipeline like lesson audio, and played with the existing listen player.
- **Concept map:** AI-generated per reader and editable by the admin. Tapping a concept shows what it is and opens its lesson.
- **Rewards:** XP, streak, quests and mastery count as they do now. No new badges.

## Non-goals
- No new question or flashcard content. Approach A reuses the lesson content; only the episodes and the concept map are new AI content.
- No per-user exam dates.
- No notifications or reminders.
- No offline session.
- No changes to the existing lesson pages, the review page or battles.

## Anti-goals (a failure even if it works)
- **An XP farm.** Repeating the session over and over must not beat the lesson quizzes for XP.
- **Overwhelming.** A day with 200 due cards must still be a ~15-minute session, not a wall.
- **A page that's empty or broken** for a reader without an exam date, episodes or concept map. Each part hides or shows a calm "not available yet" instead.
- **Leaks.** Unpublished readers or non-ready lessons appear in a student's session, map or episodes.
- **Unbounded cost.** Students can't trigger AI generation. Their only AI cost is grading, within the existing daily quota.

## Approaches (decided)
- **A. Reuse lesson content (chosen).**
  - The session is built from existing flashcards, quiz questions and open questions across the reader.
  - Only the weekly episodes and the concept map are new generated content.
  - It's cheap, consistent with lesson mastery, and builds on the quiz, review and grading code that is already proven.
- **B. Generate reader-level questions.** Rejected: new AI content per reader, duplicates what lessons already have, and costs more.
- **C. Make it a smarter `/review` page.** Rejected: no exam plan, no episodes, no concept map, and no single place for the reader.

## Design

### Data (Drizzle, one migration generated with `bun run db:generate`)
- **`reader.examDate`**: an integer timestamp (ms, the start of the exam day in Europe/Amsterdam), nullable. The admin sets it through the existing `PATCH /admin/readers/:id` (`input.patchReader` gains `examDate: number | null`).
- **`reader_episode`** (one row per reader and week), shaped like `lesson_audio` (`schema.ts:170`):
  - `readerId`, `week` (primary key `(readerId, week)`);
  - `status`, `error`;
  - `title`, `script` (JSON);
  - `chapters` (JSON array with `durationMs` and `bytes` per chapter, as `lesson_audio`);
  - `generatedAt`, `provider`, `model`, `voice`;
  - `sourceSnapshot` (JSON: `{ lessonId, generatedAt, startPage, endPage }[]` for the week's lessons at generation time).
  - **Staleness** is worked out the way `audio.ts:283` does it for lessons: an episode is stale when the week's current lesson set or any lesson's `generatedAt` or page range differs from `sourceSnapshot`.
  - Files go to `UPLOAD_DIR/audio/episodes/<readerId>/<week>/<n>.mp3`.
- **`concept_map`** (one row per reader):
  - `readerId` (primary key), `status`, `error`;
  - `data` (JSON, below), `editedAt` (set when the admin edits by hand), `updatedAt`.
  - `data` holds:
    - `concepts: { id, label, description, lessonId }[]`, at most 60;
    - `links: { from, to, label }[]`, at most 120.
  - Each concept belongs to exactly one lesson; its week comes from that lesson.
- **`reader_session_day`**: `(userId, readerId, day)` as primary key, with `day` as `YYYY-MM-DD` in Europe/Amsterdam. Columns are `sessions` (completed sessions that day, which drives the XP factor), `completedAt` (first completion), `xp`, `cards`, `questions`, `correct`. It records that today's session was done, for the "done today" state and a small streak of session days shown on the reader page.
- **`episode_progress`**: `(userId, readerId, week)`, with `listenMs` (the total heard, like `lesson_progress.listenMs`), `positionMs` (to resume), `awarded` (bool) and `updatedAt`. The lesson listen progress stores only `listenMs`; episodes also store the position so they can resume across devices.
- **`question_result`**: `(userId, questionId)` as primary key, with `lastCorrect` (bool), `seen` (count) and `lastAt`.
  - Written on the first check of a question, by both lesson quizzes and reader sessions (in `/questions/:id/check`).
  - It feeds the "wrong before or not seen yet" preference.

### The daily session (server)
**`GET /readers/:id/session`** builds today's queue. It returns 404 when the reader isn't visible to the user (unpublished, for students). The queue uses only `ready` lessons. It is built from three parts, then interleaved:

1. **Cards.**
   - Due cards (`due ≤ now`) of the reader, oldest due first.
   - **Exam pull-forward:** when an exam date is set and is within 21 days, a card reviewed before (state 2 Review or 3 Relearning) whose next due date is **after** the exam joins the pool. Its order comes from FSRS retrievability on exam day, lowest first (ts-fsrs 5.4 `get_retrievability(card, examDay, false)` returns a number).
   - New cards are never added in this session (they belong to the lessons).
   - Cap: **20 cards**.
2. **Quiz questions** (`mc|tf|fill|order`): **9 questions**.
   - Lessons are picked by weighted random draw. A lesson's weight is `(1 − mastery) + 0.15`, so even mastered lessons sometimes come back.
   - At most 3 questions per lesson, which makes it interleaved by design.
   - Within a lesson, questions are drawn at random, preferring ones whose `question_result` is missing (not seen yet) or has `lastCorrect = false`.
   - Only lessons the student has started count: summary read, any quiz or explain attempt, or any card review.
   - When nothing has been started yet, the session shows "Start with a lesson first" and a link to the current lesson, and no session is built.
3. **Explain it:** 1 open question (2 when the exam is within 7 days) from the weakest started lessons.
   - Skipped when the user's `grade` quota is used up; the client then shows the existing quota hint.

**Order:** cards are dealt in runs of 3–5 with a quiz question or an explain question between them. The explain question comes at about two-thirds of the way. The result is one list of `{ kind: "card" | "question" | "open", ... }` items, where cards carry the review-queue fields (including `lessonCode` and `intervals`).

**Server-side session:** the existing in-memory quiz session (`createQuizSession`, `quizSessions`) is generalised so `lessonId` is optional and question ids can span lessons. It is keyed by `sessionId`, with the same 3-hour expiry.
- **Checking:** `POST /questions/:id/check` works unchanged with that `sessionId`. Only the first check counts.
- **Cards** use the existing `POST /review` (each rating awards card XP as now).
- **Open questions** use the existing `POST /questions/:id/grade`.

**`POST /readers/:id/session/submit`** with `{ sessionId }` ends the session:
- **Quiz XP:** `XP.quizCorrect` per correct question, with **no perfect bonus**, times a **new per-reader daily factor**, `sessionXpFactor(sessionsToday)`:
  - the first completed session of the day gives 1;
  - the 2nd gives 0.5;
  - later ones give 0.1.
  This is a new rule in `shared/game.ts`. It is not `quizXpFactor`, which works per lesson with 1× for three quizzes and then 0.25×.
- **Attempts:** one `attempt` row per lesson touched, with a **new kind `session`**, so lesson-quiz XP factors (`todayQuizFactor`, which counts `quiz` attempts) are unaffected. `score`/`maxScore` are that lesson's questions in this session.
- **Mastery:** for each lesson with ≥ 2 checked questions, `updateProgress(quiz)` with `fraction × min(1, n / 5)`, best value only as now. A small sample can raise `bestQuiz` but never to 100% from two questions, and never lowers it. Card reviews move mastery through FSRS state as they already do. The session's open answer updates that lesson's `bestExplain` with `score / maxScore × 0.6` (best value only), since one answer is weaker evidence than the full explain exercise. This is done in the session's grade path: `POST /questions/:id/grade` with the `sessionId` passed.
- **Day record:** upserts `reader_session_day` for today, increments `sessions` and adds the totals; the first completion sets `completedAt`.
- **Quests and badges:** fires one `quiz_submit` event with `pct` over the session's quiz questions and `lessonId` = the lesson with the most questions in the session (ties go to the weakest). `award()` gets that same lesson id. Card and grade events already fire per item.
- **Open answers** are not part of `correct`/`total`; the result screen shows them separately.
- **Response:** `{ xp, correct, total, perLesson: [{ lessonId, code, correct, total }], dayStreak }`.

**`GET /readers/:id/learn`** returns the page's overview in one call:
- reader `title` and `examDate`;
- `daysToExam` (null when no date is set);
- progress: `{ mastery` (the average of lesson mastery over ready lessons, as shown on home), `masteredLessons` (mastery ≥ 0.8), `totalLessons }`;
- `due` (cards due now), and `pullForward` (cards that would join because of the exam);
- `today`: `{ done: boolean, xp }`, and `sessionDayStreak`;
- an estimate of today's session: `{ cards, questions, open, minutes }`, where `minutes` = cards × 10 s + questions × 30 s + open × 120 s, rounded;
- weak lessons: up to 3 `{ id, code, title, mastery }`;
- episodes: `[{ week, status, title, durationSec, positionMs }]` (ready ones only, for students);
- `conceptMap: boolean` (whether a ready map exists).

**`GET /readers/:id/concept-map`** returns the ready map. Concepts of lessons the user can't see are filtered out, and so are links to them.

### Episodes (admin pipeline)
- **Script:** `generateEpisodeScript(readerId, week)` follows `generateScript` in `server/ai/audio.ts`.
  - It uses the `generation` model role and is grounded in the week's lessons: their summaries, key points and terms, plus page text from `getPageText` for the lessons' page ranges, trimmed to fit.
  - **Target:** about 2,000–2,300 words (~15 minutes at the voice's pace).
  - **Chapters:**
    - a hook that says why this week matters;
    - one chapter per lesson, telling a story with examples, not reading a list;
    - a "how it connects" chapter tying the lessons to each other and to earlier weeks;
    - a short spoken self-test (3 questions with pauses, then the answers);
    - a recap.
  - **Tone:** the same as the lesson audio: `scriptInstructions` and the word-target approach in `server/ai/audio-script.ts`, plus `readerWording` from `content-rules.ts`, in the reader's language. Episode prompts and targets go in a new `server/ai/episode-script.ts`.
- **TTS and jobs:** reuse `synthesize` and the chapter runner's approach (two chapters at a time, one retry, a directory swap). The global audio queue in `audio.ts:312-376` only takes lesson ids today, so it is **refactored to queue typed jobs** (`{ kind: "lesson", lessonId } | { kind: "episode", readerId, week }`), still running one job at a time. `recoverAudio` also recovers episodes on boot.
- **Admin endpoints:**
  - `POST /admin/readers/:id/episodes` queues every week;
  - `POST /admin/readers/:id/episodes/:week` queues or regenerates one week;
  - `GET /admin/readers/:id/episodes` returns their status;
  - `DELETE /admin/readers/:id/episodes/:week`.
- **Staleness:** editing or regenerating a lesson sets `stale` on its week's episode, the same way `lesson_audio` does.
- **Listening reward:** like lesson audio, once ≥ 90% of an episode has been heard (`listenMs`), it awards the same XP as a lesson listen, once per episode (`awarded`). It does not mark any lesson's summary as read.
- **Student endpoints** mirror the lesson audio endpoints:
  - `GET /readers/:id/episodes/:week` returns the meta;
  - `.../:n.mp3` serves a chapter, with Range support;
  - `POST .../progress` saves listening progress.
  The visibility check uses the reader (published, for students) and the episode being `ready`.

### Concept map (admin pipeline)
- **Generation:** `generateConceptMap(readerId)` uses the `generation` role.
  - **Input:** every ready lesson's code, title, week, summary, key points and terms. Page text is not needed, which keeps it cheap.
  - **Output** (zod, `Output.object`):
    - concepts with label, a one-to-two-sentence description and `lessonCode`;
    - links with `fromLabel`, `toLabel` and a short relation label ("is a kind of", "causes", "is needed for", …).
  - The server maps codes and labels to ids and drops anything that doesn't resolve.
  - **Limits:** 60 concepts and 120 links; aim for 2–4 concepts per lesson.
- **Admin endpoints:**
  - `POST /admin/readers/:id/concept-map` generates or regenerates it. When the map has `editedAt`, the client asks for confirmation first, because regenerating replaces the edits.
  - `GET` returns it.
  - `PUT` saves an edited `data`, validated with zod: ids unique, links refer to existing concepts, `lessonId` belongs to the reader, and the limits apply.

### Student UI
- **Home card** "De hele reader leren" / "Learn the whole reader":
  - It sits between the reader switcher/title and the world map, for the selected reader.
  - It shows:
    - the exam countdown ("Tentamen over 12 dagen"), or "Geen tentamendatum" when none is set;
    - today's state: "Sessie van vandaag · ~15 min" with a start arrow, or "Vandaag gedaan ✓";
    - a thin progress bar (reader mastery).
  - Tapping it opens `/reader/:id`. Chunky card styling (Speelveld).
- **`/reader/:id`** (inside `AppLayout`, lazy, and part of the idle warm-up), top to bottom:
  1. A header with the reader title and a back link to home.
  2. **Today:**
     - a big chunky start button, "Start sessie van vandaag", with the estimate ("12 kaarten · 8 vragen · 1 uitleg · ~14 min");
     - when today's session is done, it becomes a calm "Vandaag gedaan" state with an "Extra ronde" secondary button, which pays reduced XP as described above;
     - when nothing has been started, it shows "Begin eerst met een les" with a button to the current lesson.
  3. **Exam:** a countdown tile (days, plus the date). When the exam is within 21 days, a short line explains that cards are being pulled forward for the exam. Hidden when no date is set.
  4. **Progress:**
     - reader mastery (a ring or bar) and "8 van 14 lessen beheerst";
     - cards due;
     - the session-day streak;
     - up to 3 "Zwakke lessen" chips that open those lessons.
  5. **Concept map** (when ready): see below.
  6. **Afleveringen:** one row per week with a ready episode, showing "Week 3 · <title> · 15 min", a play button and resume progress. Opening a row goes to `/reader/:id/episode/:week`, which reuses the listen view in a generalized form.
- **`/reader/:id/session`** (`StudyShell`, full screen, lazy) runs the mixed queue. The existing components aren't split for reuse yet, so this job pulls them apart first, without changing their current behaviour:
  - the card face and rating UI out of `FlashcardSession`, which today fetches `/review/queue` itself (`flashcard-session.tsx:38-55`);
  - `QuestionPrompt`, `QuestionInput` and `GradeCard` from the quiz (already reusable);
  - the open-question answer and grade UI out of `open-tab.tsx`;
  - the listen player: `useListenPlayer` and `ListenView` take an audio *source* (`{ key, title, chapters, chapterUrl(n), progressUrl }`) instead of a lesson id and `LessonDetail`, so lessons and episodes share them.

  It shows a progress bar over all items, closes with a confirmation if the session is unfinished, and ends with a result screen: XP, correct/total, per-lesson results with links to weak lessons, and "Vandaag gedaan".
  - **Leaving early:** cards already rated keep their reviews and XP. Quiz XP is only paid on submit.
- **Concept map view:**
  - A vertical, mobile-first diagram with no new dependencies. Concepts are rounded chips grouped in week bands (top = week 1), and links are drawn as soft curves in an SVG layer behind the chips.
  - A concept's colour shows its lesson's mastery (not started / learning / mastered).
  - **Tapping a concept** opens a sheet (the drawer on phones) with the label, description, its links ("→ veroorzaakt X", tappable to jump to X) and "Open les <code>".
  - Above 40 concepts, a week filter keeps it readable.
  - A list fallback for screen readers, with the same content as nested lists, is always in the DOM.
- **Copy** in nl and en. Light and dark themes.

### Admin UI
The admin reader page gets **tabs**:
- **Structuur:** the current content, unchanged.
- **Leren:** the reader-learning admin, with these sections:
  - **Tentamendatum:** a date picker and clear, saved through `PATCH`.
  - **Afleveringen:** per week, status, duration, a stale badge, Generate/Regenerate, Play (the admin preview) and Delete, plus "Alle weken genereren". Polls while generating, like the audio column does.
  - **Conceptkaart:** status and Generate/Regenerate (with a confirm when there are manual edits), plus a list editor:
    - concepts as editable rows (label, description, lesson select, delete);
    - "Concept toevoegen";
    - per concept, its outgoing links (target select, relation label, delete) and "Link toevoegen";
    - a save bar (the existing `save-bar` pattern) and a read-only preview using the student view.

## Constraints
- Same stack and patterns:
  - Hono routes in `server/routes` with zod in `server/lib/input.ts`;
  - Drizzle migrations;
  - TanStack Query keys in `qk`;
  - shadcn/ui, Speelveld styling, mobile-first, light and dark themes;
  - nl primary and en.
- No new runtime dependencies.
- The bundle budget (800 KB first load) still holds. Every new page and the session are lazy.
- Never echo user input in errors. Rate limits:
  - session build: `limits.writes`-like, 30 per hour per user;
  - submit and grade: the existing limiters.
- Only the admin can trigger generation, and AI generation runs on the existing model roles and settings.
- Tests must not import `src/lib/i18n.ts`.

## Testing
- **Session builder (pure function `buildSessionPlan(input) → items`, unit-tested with fixed seeds):**
  - the card cap of 20 holds;
  - pull-forward only happens within 21 days of the exam and orders cards by retrievability;
  - at most 2 questions per lesson;
  - the weighted lesson draw favours weak lessons over many runs;
  - the interleaving pattern holds;
  - with no started lessons the plan is empty and flagged as "start a lesson first";
  - the open question is dropped when there is no quota.
- **API:**
  - unpublished reader → 404 for students;
  - non-ready lessons excluded;
  - the generalized session works with `/questions/:id/check` (first check counts);
  - submit XP factor: first session full, second 50%, third 10%; no perfect bonus;
  - `updateProgress` only for lessons with ≥ 3 questions;
  - the `reader_session_day` upsert;
  - concept-map `PUT` validation;
  - episode endpoints: visibility, Range requests and progress.
- **Episode and concept-map generation** are tested with the AI stub (`AI_STUB=1`), the same as the existing pipeline tests: schema mapping, unresolved codes dropped, limits applied.
- **UI:** the pure helpers (countdown copy, estimate minutes, concept-map layout positions) get unit tests. The page and session screen get a `renderToString` smoke test with nl and en for unresolved keys.

## Left to the builder
- The exact visual layout within the design language.
- Concept-map layout details: chip placement within a week band, and the curve routing.
- Episode chapter word targets per chapter kind.
- Empty-state copy.

## Calls made after the builder check (the designer's calls, for the owner to check)
- **Mastery from the session:**
  - quiz results raise `bestQuiz` for lessons with ≥ 2 questions, scaled by sample size (`fraction × min(1, n/5)`), best value only;
  - the open answer raises `bestExplain` at 0.6 weight.
  - So the session does make weak lessons stronger, but can't max a lesson out from a handful of questions.
- **Per-question history:** the new `question_result` table, written by lesson quizzes too.
- **Anti-farm:**
  - the new `session` attempt kind keeps lesson-quiz XP factors untouched;
  - a per-reader session factor of 1 / 0.5 / 0.1 per day, counted in `reader_session_day.sessions`.
- **Episode listening** gives the same one-time XP as a lesson listen at 90% heard, and doesn't mark lessons as read.
- **Quest and badge events** use the session's main lesson (most questions; ties go to the weakest).
- **9 quiz questions, at most 3 per lesson** (was 8 and 2), so a lesson can reach the 2-question mastery threshold.
- **Refactors:** the audio queue becomes a typed job queue, and the flashcard, open-question and listen components are split for reuse, all without changing current behaviour.
