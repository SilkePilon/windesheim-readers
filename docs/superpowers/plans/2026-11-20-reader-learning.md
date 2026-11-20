# Whole-Reader Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-reader learning page with a daily mixed session, an exam countdown and plan, weekly audio episodes and a concept map, plus the admin tools to set the exam date and generate or edit episodes and maps.

**Architecture:**
- The **session plan** is a pure function in `shared/reader-session.ts`, fed by the server, which owns visibility, the session store and XP.
- **Episodes** reuse the lesson-audio approach on a typed job queue.
- The **concept map** is one JSON row per reader.
- The **client** reuses the existing study parts after splitting them for reuse. The reader page, session, episode player and admin tab are all lazy.

**Tech Stack:** React 19, react-router 8, TanStack Query, shadcn/ui + Tailwind v4, react-i18next; Hono on Bun, Drizzle + bun:sqlite, ts-fsrs 5.4, Vercel AI SDK (`generateText` + `Output.object`), bun test.

**Spec:** `docs/superpowers/specs/2026-11-20-reader-learning-design.md`

## Global Constraints

- **No new runtime dependencies.** The first-load budget (`bun run budget`, 800 000 bytes raw) must keep passing. Every new page and screen is `lazy()` through `PAGE_LOADERS` in `src/lib/warm-up.ts`.
- **Tests:**
  - Tests never import `src/lib/i18n.ts`; pure logic lives in modules without i18n.
  - AI calls in tests use the stub (`AI_STUB=1`, see `server/ai/speech.ts:12`, `server/ai/chat-stub.ts`).
- **Visibility:** students only ever see published readers and `ready` lessons. Admins see unpublished readers but still only `ready` lessons in sessions and maps.
- **Day boundaries** are `YYYY-MM-DD` in Europe/Amsterdam (reuse `dayKey` from `server/lib/time`).
- **Session numbers:**
  - cards: cap 20;
  - quiz questions: 9, at most 3 per lesson;
  - open questions: 1, or 2 when `daysToExam ≤ 7`;
  - pull-forward window: 21 days;
  - lesson weight: `(1 − mastery) + 0.15`;
  - estimate: cards × 10 s + questions × 30 s + open × 120 s.
- **Session XP:**
  - `XP.quizCorrect` (10) per correct quiz question, with no perfect bonus;
  - `sessionXpFactor(n)` = 1, 0.5, then 0.1 for the 1st, 2nd and 3rd+ completed session per reader per day.
- **Session mastery:**
  - lessons with ≥ 2 checked questions: `updateProgress(quiz)` with `fraction × min(1, n/5)`;
  - an open answer in a session: `bestExplain` gets `score/maxScore × 0.6`;
  - best value only.
- **New attempt kind `"session"`.** Lesson-quiz `todayQuizFactor` must be unaffected.
- **Episode XP:** `XP.episodeListen = 5`, once per episode at ≥ 90% heard (`LISTENED_SHARE`). It never marks lessons as read.
- **Concept map limits:** 60 concepts and 120 links.
- **Copy** in nl (primary) and en. Light and dark themes. Mobile-first. Speelveld styling (chunky cards, `shadow-[0_4px_0_var(--chunky)]`).
- **Errors** never echo user input. New student routes use the existing limiters (`limits.writes`, `limits.grade`, `limits.ai`).

## Review Focus

- **Empty reader:** a reader with no exam date, no episodes and no map, for a student who has started nothing. The page shows the "start a lesson first" state and hides the exam, map and episode sections, with no errors. (Task 9 render test; Task 3 API test.)
- **Huge backlog:** 200 due cards still give a 20-card session and a ~15 min estimate. (Task 2 test.)
- **Expiry:** submitting a session twice, or after the 3 h expiry, pays no double XP and returns `NO_SESSION` the second time. (Task 3 test.)
- **Unpublished reader:** a student gets 404 on `/readers/:id/learn`, `/session`, `/concept-map` and episode routes. An admin gets 200. (Tasks 3, 5, 6 tests.)
- **Regenerating** a concept map that has manual edits asks first. A `PUT` with a link to a missing concept or another reader's lesson returns 400. (Tasks 6, 12 tests.)

---

### Task 1: Schema, migration and admin exam date

**Files:**
- Modify:
  - `server/db/schema.ts`: `reader.examDate`; new tables `readerEpisode`, `conceptMap`, `readerSessionDay`, `episodeProgress`, `questionResult`; `AttemptKind` adds `"session"`.
  - `server/lib/input.ts`: `patchReader` gains `examDate`.
  - `server/routes/admin.ts`: PATCH saves `examDate`; `GET /admin/readers/:id` returns it.
  - The generated migration in `server/db/migrations/` (`bun run db:generate`).
- Test: `tests/reader-learning-schema.test.ts`

**Interfaces:**
- Produces (Drizzle names; the columns are exactly as in the spec's "Data" section):
  - `reader.examDate: integer("exam_date", { mode: "number" })`, nullable: ms at 00:00 Europe/Amsterdam on the exam day.
  - `readerEpisode`: primary key `(readerId, week)`.
    - `status: "pending"|"generating"|"ready"|"error"`, `error`, `title`.
    - `script` (JSON).
    - `chapters` (JSON, the same element type as `lessonAudio.chapters`).
    - `generatedAt`, `provider`, `model`, `voice`.
    - `sourceSnapshot` (JSON `{ lessonId: string; generatedAt: number | null; startPage: number; endPage: number }[]`).
    - `readerId` is a foreign key to reader with `ON DELETE CASCADE`.
  - `conceptMap`: `readerId` primary key and foreign key (cascade), `status`, `error`, `data` (JSON `ConceptMapData`, see Task 6), `editedAt`, `updatedAt`.
  - `readerSessionDay`: primary key `(userId, readerId, day)`, plus `sessions int default 0`, `completedAt`, `xp`, `cards`, `questions`, `correct`. Both foreign keys cascade.
  - `episodeProgress`: primary key `(userId, readerId, week)`, plus `listenMs`, `positionMs`, `awarded bool default false`, `updatedAt`.
  - `questionResult`: primary key `(userId, questionId)`, plus `lastCorrect bool`, `seen int`, `lastAt`. Both foreign keys cascade.
  - `input.patchReader`: `examDate: z.number().int().positive().nullable().optional()`.

- [ ] **Step 1: Write the failing test** in `tests/reader-learning-schema.test.ts`. Run migrations, then:
  - insert a row in each new table and read it back;
  - deleting the reader removes its `readerEpisode`, `conceptMap` and `readerSessionDay` rows;
  - via the real app as admin (sign in as in `tests/feedback-app.test.ts`):
    - `PATCH /api/admin/readers/:id { examDate: 1798000000000 }` → 200, and `GET` returns `examDate: 1798000000000`;
    - `{ examDate: null }` clears it;
    - `{ examDate: "x" }` → 400.
- [ ] **Step 2: Run** `bun test tests/reader-learning-schema.test.ts` and expect FAIL.
- [ ] **Step 3: Implement** the schema, input and admin changes, then run `bun run db:generate` and keep drizzle's generated file name.
- [ ] **Step 4: Run** `bun test && bun run typecheck` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): schema for exam date, episodes, concept map, session days`

### Task 2: Pure session logic

**Files:**
- Create: `shared/reader-session.ts`
- Modify: `shared/game.ts` (`XP.episodeListen = 5`; `sessionXpFactor`)
- Test: `tests/reader-session.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SESSION = { cards: 20, questions: 9, perLesson: 3, pullForwardDays: 21, weightFloor: 0.15 } as const;
  export type PlanCard = { id: string; lessonId: string; due: number; retrievabilityAtExam?: number; pullForward?: boolean };
  export type PlanQuestion = { id: string; lessonId: string; seen: boolean; lastCorrect: boolean | null };
  export type PlanLesson = { id: string; mastery: number; started: boolean };
  export type SessionPlanInput = {
    now: number; examDate: number | null; seed: number;
    dueCards: PlanCard[];          // due <= now, any order
    pullForwardCards: PlanCard[];  // due > exam, with retrievabilityAtExam
    questions: PlanQuestion[];     // quiz types only, ready lessons only
    openQuestions: PlanQuestion[];
    lessons: PlanLesson[];
    openAllowed: boolean;          // grade quota left
  };
  export type PlanItem = { kind: "card"; id: string } | { kind: "question"; id: string } | { kind: "open"; id: string };
  export type SessionPlan = { items: PlanItem[]; needsStart: boolean; counts: { cards: number; questions: number; open: number }; minutes: number };
  export function buildSessionPlan(input: SessionPlanInput): SessionPlan;
  export function daysToExam(now: number, examDate: number | null): number | null; // whole days, Europe/Amsterdam, 0 on exam day, negative after
  export function estimateMinutes(c: { cards: number; questions: number; open: number }): number; // rounded, min 1 when any item
  export function sessionMastery(correct: number, n: number): number | null; // null when n < 2; else (correct/n) * min(1, n/5)
  export function mainLessonId(perLesson: { lessonId: string; total: number; mastery: number }[]): string | null; // most questions, tie → lowest mastery
  // shared/game.ts
  export function sessionXpFactor(completedBefore: number): number; // 0 → 1, 1 → 0.5, ≥2 → 0.1
  ```
- Use a seeded RNG (the existing `mulberry32` in `src/lib/world/rng.ts`). If that file imports anything client-only, copy the 6-line function into `shared/rng.ts` and re-export it from the old path.

- [ ] **Step 1: Write the failing tests** in `tests/reader-session.test.ts`:
  - **card cap:** 200 due cards → 20 `card` items, oldest `due` first;
  - **pull-forward:**
    - `examDate` 30 days out → pull-forward cards ignored;
    - 10 days out with 5 due cards → the remaining slots are filled from `pullForwardCards`, ordered by `retrievabilityAtExam` ascending;
  - **lesson cap:** no lesson has more than 3 `question` items; the total is 9 when enough questions exist;
  - **weighting:**
    - over 500 seeds, a lesson with mastery 0.1 gets at least twice the questions of a lesson with mastery 0.9;
    - an unstarted lesson gets none;
  - **seen/wrong preference:** within a lesson, unseen or `lastCorrect === false` questions are taken before `lastCorrect === true` ones;
  - **interleave:** no more than 5 `card` items in a row while questions remain, and the first `open` item lands between 50% and 80% of the list;
  - **open count:** 1 open item; 2 when `daysToExam ≤ 7`; 0 when `openAllowed` is false;
  - **nothing started:** no started lessons → `needsStart: true` and `items: []`;
  - **estimate:** `estimateMinutes({cards:20,questions:9,open:1})` = 10 (200 + 270 + 120 = 590 s → 10);
  - **days to exam:** `daysToExam` is 0 on the exam day, 1 the day before (across a DST change: exam 2027-03-29, now 2027-03-27T23:30Z), and null without a date;
  - **mastery:** `sessionMastery(2,2)` = 0.4, `sessionMastery(3,3)` = 0.6, `sessionMastery(1,1)` = null, `sessionMastery(5,5)` = 1;
  - **XP factor:** `sessionXpFactor(0)` = 1, `(1)` = 0.5, `(2)` = 0.1, `(7)` = 0.1;
  - **main lesson:** `mainLessonId` picks the most questions, and the lowest mastery on a tie.
- [ ] **Step 2: Run** `bun test tests/reader-session.test.ts` and expect FAIL.
- [ ] **Step 3: Implement.**
  - **Lesson draw:** weighted sampling without replacement per question slot, re-weighting a lesson to 0 once it has 3 questions.
  - **Interleave:** split the cards into runs of 3–5 (sizes from the RNG), put one question after each run, append leftover questions or cards alternately, then insert the open item(s) at round(0.66 × length). With 2 open items, the second goes at the end − 1.
- [ ] **Step 4: Run** `bun test tests/reader-session.test.ts` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): pure session plan, exam days and session XP rules`

### Task 3: Session and overview API

**Files:**
- Create: `server/routes/reader-learn.ts` (a Hono router mounted on `/api` before `learn`, guarded by `requireUser` like `learn`), `server/lib/reader-learn.ts` (data loading for the plan and overview)
- Modify:
  - `server/routes/learn.ts`:
    - export and generalize `QuizSession` (`lessonId: string | null`, plus `readerId?: string`, `submitted?: boolean`) and `createQuizSession(userId, lessonId | null, questionIds, readerId?)`;
    - `/questions/:id/check` upserts `questionResult` on the first check;
    - `/questions/:id/grade` accepts an optional `sessionId`.
  - `server/lib/input.ts`: `openAnswer` gains `sessionId: id.optional()`; new `sessionSubmit = z.object({ sessionId: id }).strict()`.
  - `server/app.ts`: mount the router.
- Test: `tests/reader-learn-api.test.ts`

**Interfaces:**
- Consumes: `buildSessionPlan`, `daysToExam`, `estimateMinutes`, `sessionMastery`, `mainLessonId`, `SESSION` (Task 2); `sessionXpFactor`, `XP` (shared/game); `visibleLesson`, `award`, `toCard`, `previewIntervals` (export the ones needed from learn.ts); `cardMasteryByLesson`, `updateProgress`, `computeMastery`; ts-fsrs `get_retrievability(card, examDate, false)`.
- Produces (client types go in `src/lib/types.ts`):
  - **`GET /api/readers/:id/learn`** returns `ReaderLearn`:
    ```ts
    { reader: { id, title, examDate: number | null }, daysToExam: number | null,
      progress: { mastery: number; masteredLessons: number; totalLessons: number },
      due: number, pullForward: number, today: { done: boolean; xp: number; sessions: number }, sessionDayStreak: number,
      estimate: { cards: number; questions: number; open: number; minutes: number }, needsStart: boolean,
      currentLessonId: string | null, weakLessons: { id: string; code: string; title: string; mastery: number }[],
      episodes: { week: number; title: string; durationSec: number; positionMs: number; listenMs: number }[], conceptMap: boolean }
    ```
    Students only see ready episodes. `sessionDayStreak` is the number of consecutive days, ending today or yesterday, that have a `readerSessionDay.completedAt`.
  - **`GET /api/readers/:id/session`** (`limits.writes`) returns `ReaderSession`:
    ```ts
    { sessionId: string | null, needsStart: boolean, xpPerCorrect: number,
      items: ( { kind: "card"; card: ReviewCard } | { kind: "question"; question: PublicQuestion } | { kind: "open"; question: PublicQuestion } )[] }
    ```
    `ReviewCard` is the `/review/queue` item shape: `id, lessonId, lessonCode, front, back, isNew, intervals`. `PublicQuestion` is `publicQuestion(q)`, plus the lesson `code`. `sessionId` is null when `needsStart` is true.
  - **`POST /api/readers/:id/session/submit { sessionId }`** (`limits.writes`) returns `{ xp, correct, total, perLesson: { lessonId, code, correct, total }[], dayStreak, award }`. It marks the session `submitted`; a second submit returns `400 { error: "NO_SESSION" }`.
  - **`/questions/:id/grade` with a `sessionId`** of a reader session owned by the user, where the question belongs to it: also calls `updateProgress(explain)` with `score / 100 × 0.6`.

- [ ] **Step 1: Write the failing tests** in `tests/reader-learn-api.test.ts`, using the real app and seeding through `db` as in `tests/learn-scope.test.ts`. Seed:
  - a published reader with 4 ready lessons (one with an `open` question), plus 1 non-ready lesson that has questions;
  - an unpublished reader;
  - a student who has started lessons 1–3, with due cards in lessons 1 and 2.

  Assertions:
  - **Learn overview:**
    - as the student, the published reader → 200, with `needsStart: false`, `due` = the seeded count and `daysToExam: null`;
    - as the student, the unpublished reader → 404 (and as admin → 200);
    - a fresh student with nothing started → `needsStart: true`, `currentLessonId` = the first lesson.
  - **Session:**
    - no item comes from lesson 4 (not started) or the non-ready lesson;
    - card items equal the due cards;
    - there are 3 or fewer questions per lesson.
  - **Check across lessons:** `POST /questions/:qid/check` with the session id works for questions from different lessons. The first check is stored in `question_result` (`seen` 1). A second check of the same question doesn't change the session result.
  - **Submit:**
    - after checking 3 questions of lesson 1 (2 correct), submit → `xp` = 20, `perLesson` includes lesson 1 `{correct: 2, total: 3}`;
    - `lesson_progress.bestQuiz` for lesson 1 = `(2/3) × 0.6` = 0.4;
    - a `session` attempt row exists, and no `quiz` attempt row;
    - a second submit with the same id → 400 `NO_SESSION`;
    - the second session that day: xp × 0.5; the third: × 0.1;
    - `readerSessionDay.sessions` = 3.
  - **Lesson quiz untouched:** after 3 reader sessions, `GET /lessons/:l1/quiz` still returns `xpPerCorrect` 10.
  - **Open answer:** grade with the `sessionId` (AI stub) → `bestExplain` = `score/100 × 0.6`; grade without one → `bestExplain` unchanged.
  - **Exam pull-forward:** with `examDate` 10 days out and a card in state 2 due 30 days out, the learn overview has `pullForward` ≥ 1 and the session includes that card.
- [ ] **Step 2: Run** `bun test tests/reader-learn-api.test.ts` and expect FAIL.
- [ ] **Step 3: Implement.**
  - **Loading:** `server/lib/reader-learn.ts` exports:
    - `loadPlanInput(user, readerId, now): Promise<{ input: SessionPlanInput; lessons: LessonRow[] } | null>` (null = not visible);
    - `readerOverview(user, readerId, now): Promise<ReaderLearn | null>`.
  - **Started lessons:** a lesson counts as started when it has a `lesson_progress` row with `summaryRead`, `bestQuiz > 0`, `bestExplain > 0` or `listenMs > 0`, or when it has a `card_review` row.
  - **Lesson codes:** card items take `lessonCode` from a join, as in the review queue.
- [ ] **Step 4: Run** `bun test && bun run typecheck` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): daily session and overview API`

### Task 4: Typed audio queue and episode generation (admin)

**Files:**
- Create: `server/ai/episode-script.ts` (prompts, word targets, zod schema, stub script), `server/ai/episodes.ts` (`generateEpisode`, `queueReaderEpisodes`, staleness, paths)
- Modify:
  - `server/ai/audio.ts`:
    - the queue (`runBatch`, `failWaiting`, `queueReaderAudio` ~L312-380) takes `AudioJob = { kind: "lesson"; lessonId: string } | { kind: "episode"; readerId: string; week: number }`;
    - lesson behaviour stays the same;
    - `recoverAudio` also resets `generating` episodes to `error`.
  - `server/routes/admin.ts`: the episode endpoints.
- Test: `tests/episodes.test.ts` (and `tests/audio-job.test.ts` must still pass unchanged)

**Interfaces:**
- Produces:
  - `episodeDir(readerId, week)` = `UPLOAD_DIR/audio/episodes/<readerId>/<week>`; `episodeChapterPath(readerId, week, n)`.
  - `generateEpisodeScript(readerId: string, week: number): Promise<EpisodeScript>`, with `EpisodeScript = { title: string; chapters: { kind: "hook"|"lesson"|"connect"|"selftest"|"recap"; title: string; text: string }[] }`.
    - The total target is 2000–2300 words.
    - There is one `lesson` chapter per ready lesson of the week, in `position` order.
    - It is grounded in the lessons' summary, keyPoints and terms, plus `getPageText` for their page ranges, capped at 24 000 characters.
  - `generateEpisode(readerId, week, deps?: AudioJobDeps): Promise<AudioJobResult>`. It works like `generateLessonAudio`: in-flight guard, 2 chapters in parallel, one retry, directory swap. It writes `readerEpisode` with `sourceSnapshot`.
  - `episodeIsStale(row, currentLessons): boolean`: true when the lesson id set, any `generatedAt` or any page range differs from `sourceSnapshot`.
  - `queueReaderEpisodes(readerId, opts: { weeks?: number[]; force?: boolean })`.
  - **Admin routes:**
    - `GET /api/admin/readers/:id/episodes` → `[{ week, status, title, stale, durationSec, error }]` for every week that has ready lessons;
    - `POST /api/admin/readers/:id/episodes` (all weeks) and `POST /api/admin/readers/:id/episodes/:week` (`force` true) → 202;
    - `DELETE /api/admin/readers/:id/episodes/:week` → 204, and deletes the files.

- [ ] **Step 1: Write the failing tests** in `tests/episodes.test.ts`, with `AI_STUB=1` set in the test before importing and stub `speak` deps as in `tests/audio-job.test.ts`. Seed a reader with week 1 (2 lessons) and week 2 (1 lesson). Assertions:
  - `generateEpisode(r, 1)` → `ready`; the chapter files exist; there are 2 `lesson` chapters; `sourceSnapshot` has 2 entries;
  - **staleness:** changing lesson 1's `generatedAt` → `episodeIsStale` true; unchanged → false;
  - **queue:** `queueReaderEpisodes(r)` processes weeks 1 and 2 one at a time; a lesson job queued at the same time also completes, and lesson audio still works;
  - **admin routes:** a student gets 403; an admin GET lists both weeks; DELETE removes the row and the directory;
  - **recovery:** `recoverAudio()` turns a `generating` episode into `error`.
- [ ] **Step 2: Run** `bun test tests/episodes.test.ts tests/audio-job.test.ts`. Expect the new test to FAIL and the old one to PASS.
- [ ] **Step 3: Implement.** Refactor the queue first and re-run `tests/audio-job.test.ts` and `tests/audio.test.ts` (both must pass) before adding episodes.
- [ ] **Step 4: Run** `bun test && bun run typecheck` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): weekly audio episodes on a typed audio queue`

### Task 5: Episode student endpoints

**Files:**
- Modify: `server/routes/reader-learn.ts`
- Test: `tests/episodes-api.test.ts`

**Interfaces:**
- Consumes: `episodeChapterPath`, the `readerEpisode` and `episodeProgress` tables, `XP.episodeListen`, `LISTENED_SHARE` (export it from learn.ts if needed), `award`.
- Produces:
  - **`GET /api/readers/:id/episodes/:week`** → `{ week, title, status, chapters: { n, title, durationMs }[], totalMs, positionMs, listenMs }`. It returns 404 when the reader isn't visible, and 409 `AUDIO_NOT_READY` when the episode isn't ready.
  - **`GET /api/readers/:id/episodes/:week/:n.mp3`**: Range support with the same headers as the lesson chapter route (copy that handler's logic into a shared helper `serveChapter(c, path)` in `server/lib/audio-file.ts`, and use it for both).
  - **`POST /api/readers/:id/episodes/:week/progress { positionMs, heardMs? }`** (`limits.writes`) → `{ listenMs, award }`. It upserts `episodeProgress` (`listenMs` is the max of the old value and `heardMs ?? positionMs`, capped at `totalMs`). When `listenMs ≥ LISTENED_SHARE × totalMs` and `!awarded`, it awards `XP.episodeListen` with reason `"episode"` and sets `awarded`. It never touches `lesson_progress`.

- [ ] **Step 1: Write the failing tests:**
  - a student on an unpublished reader → 404;
  - a not-ready episode → 409;
  - a Range request `bytes=0-9` → 206 with 10 bytes;
  - progress at 50% → `award: null`; at 95% → `award.xp` = 5; again at 100% → `award: null`;
  - `lesson_progress` is unchanged;
  - the learn overview (Task 3) now lists the ready episode with `positionMs`.
- [ ] **Step 2: Run** `bun test tests/episodes-api.test.ts` and expect FAIL.
- [ ] **Step 3: Implement.** Move the lesson chapter handler to `serveChapter` without changing its behaviour (`tests/compress.test.ts`'s audio Range case must still pass).
- [ ] **Step 4: Run** `bun test && bun run typecheck` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): play and track weekly episodes`

### Task 6: Concept map generation and endpoints

**Files:**
- Create: `server/ai/concept-map.ts`, `shared/concept-map.ts` (types plus pure validation)
- Modify: `server/routes/admin.ts`, `server/routes/reader-learn.ts`, `server/lib/input.ts`
- Test: `tests/concept-map.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // shared/concept-map.ts
  export const CONCEPT_LIMITS = { concepts: 60, links: 120, label: 80, description: 400, relation: 60 } as const;
  export type Concept = { id: string; label: string; description: string; lessonId: string };
  export type ConceptLink = { from: string; to: string; label: string };
  export type ConceptMapData = { concepts: Concept[]; links: ConceptLink[] };
  export function validateConceptMap(d: ConceptMapData, lessonIds: Set<string>): { ok: true } | { ok: false; error: "DUPLICATE_ID" | "UNKNOWN_CONCEPT" | "UNKNOWN_LESSON" | "TOO_MANY" | "SELF_LINK" };
  export function visibleMap(d: ConceptMapData, visibleLessonIds: Set<string>): ConceptMapData; // drops concepts of hidden lessons and their links
  ```
  - **`generateConceptMap(readerId, deps?: { generate?: ... })`:**
    - uses `getModel("generation")` with `Output.object`;
    - the input is each ready lesson's code, title, week, summary, keyPoints and terms;
    - the output is concepts `{label, description, lessonCode}` and links `{fromLabel, toLabel, label}`;
    - labels are matched case-insensitively and trimmed, and anything unresolved is dropped;
    - the result is truncated to the limits, given `nanoid` ids, and written as `ready`, with `editedAt` null;
    - under the stub it produces 2 concepts per lesson with chain links.
  - **Admin routes:**
    - `POST /api/admin/readers/:id/concept-map` → 202; generation runs in the background and the status goes to `generating`;
    - `GET` → `{ status, error, data, editedAt, updatedAt } | null`;
    - `PUT { data }` → 200; it validates with zod (sizes from `CONCEPT_LIMITS`) plus `validateConceptMap`, returns 400 `{ error: <code> }` on failure, and sets `editedAt`.
  - **Student route:** `GET /api/readers/:id/concept-map` → `ConceptMapData & { lessons: { id, code, title, week, mastery }[] }`. It returns 404 when the reader isn't visible or there is no ready map, and applies `visibleMap`.

- [ ] **Step 1: Write the failing tests:**
  - **`validateConceptMap`:** each error code is triggered by its case;
  - **`visibleMap`:** drops the concepts of hidden lessons and their links;
  - **generation (stub):** `ready`, 2 concepts per ready lesson, all links resolved;
  - **PUT:**
    - a valid edit → 200 with `editedAt` set;
    - a link to an unknown concept → 400 `UNKNOWN_CONCEPT`;
    - another reader's lesson id → 400 `UNKNOWN_LESSON`;
    - 61 concepts → 400;
  - **student:** unpublished → 404; published → 200, with no concepts from the non-ready lesson;
  - **admin-only:** a student POST → 403.
- [ ] **Step 2: Run** `bun test tests/concept-map.test.ts` and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test && bun run typecheck` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): AI concept map with admin editing`

### Task 7: The listen player takes an audio source

**Files:**
- Modify: `src/components/listen/use-listen-player.ts`, `src/components/listen/listen-view.tsx`, `src/pages/lesson.tsx` (the lesson listen tab passes a lesson source), `src/lib/listen.ts`
- Test: `tests/listen.test.ts` (extend)

**Interfaces:**
- Produces, in `src/lib/listen.ts` (no i18n import):
  ```ts
  export type AudioSource = { key: string; title: string; chapters: { n: number; title: string; durationMs: number }[];
    chapterUrl: (n: number) => string; progressUrl: string; resumeMs: number };
  export function lessonAudioSource(l: LessonDetail, audio: LessonAudio): AudioSource; // key `lesson:<id>`, existing URLs
  export function episodeAudioSource(readerId: string, ep: EpisodeMeta): AudioSource;   // key `episode:<readerId>:<week>`
  ```
  - `useListenPlayer(source: AudioSource, opts: { onAward?: ... })` keeps its current return shape.
  - Its localStorage position key becomes `listen:<source.key>`. Read the old lesson key once as a fallback, so existing lesson positions aren't lost.
  - `ListenView` takes `source` plus an optional `header` slot instead of `LessonDetail`.
  - `EpisodeMeta` is the Task 5 GET response type (in `src/lib/types.ts`).

- [ ] **Step 1: Write the failing tests:**
  - `lessonAudioSource` builds the same chapter and progress URLs the player used before (`/api/lessons/<id>/audio/<n>.mp3` and `/api/lessons/<id>/audio/progress`; check the exact strings at `use-listen-player.ts:131`);
  - `episodeAudioSource` builds `/api/readers/<r>/episodes/<w>/<n>.mp3` and `/api/readers/<r>/episodes/<w>/progress`;
  - the storage-key helper reads the legacy lesson key as a fallback.
- [ ] **Step 2: Run** `bun test tests/listen.test.ts` and expect FAIL.
- [ ] **Step 3: Implement.** The lesson listen tab must behave exactly as before: same URLs, award toast and summary-read invalidation.
- [ ] **Step 4: Run** `bun test && bun run typecheck && bunx vite build && bun run budget` and expect PASS.
- [ ] **Step 5: Commit** `refactor(listen): the player plays any audio source (lessons, episodes)`

### Task 8: Reusable card and open-question parts

**Files:**
- Create: `src/components/study/review-card.tsx` (the card face, flip and rating buttons, with no fetching), `src/components/study/open-question.tsx` (the answer box, grade call, result and model answer)
- Modify:
  - `src/components/flashcard-session.tsx`: uses `ReviewCard` and keeps its own queue fetching;
  - `src/components/open-tab.tsx`: uses `OpenQuestion`.
- Test: `tests/study-parts.test.tsx`

**Interfaces:**
- Produces:
  - `ReviewCard({ card: ReviewCardData, onRated: (r: { rating: 1|2|3|4; result: ReviewResult }) => void })`. It posts `/api/review` itself, as the session does today. `ReviewCardData` is the `/review/queue` item type.
  - `OpenQuestion({ question: PublicQuestion, sessionId?: string, onGraded?: (g: GradeResult) => void })`. It posts `/api/questions/:id/grade` with `{ answer, sessionId? }` and handles the quota (the existing `AiLimitNotice`).
  - Both render without a router or query client beyond what they need, so `renderToString` works in tests with a QueryClientProvider.

- [ ] **Step 1: Write the failing test.** `renderToString` with an i18n instance built in the test (like `tests/about.test.tsx`):
  - `ReviewCard` shows the front text and no back before the flip;
  - `OpenQuestion` shows the prompt and a submit button.
- [ ] **Step 2: Run** `bun test tests/study-parts.test.tsx` and expect FAIL.
- [ ] **Step 3: Implement** by moving the existing JSX and handlers. Flashcards and the lesson open tab must look and behave the same.
- [ ] **Step 4: Run** `bun test && bun run typecheck && bunx vite build && bun run budget` and expect PASS.
- [ ] **Step 5: Commit** `refactor(study): reusable review card and open question`

### Task 9: Reader page, home card and episode screen

**Files:**
- Create:
  - `src/pages/reader-learn.tsx` (`/reader/:id`);
  - `src/pages/reader-episode.tsx` (`/reader/:id/episode/:week`);
  - `src/components/reader-learn/home-card.tsx`;
  - `src/components/reader-learn/today-card.tsx`, `exam-tile.tsx`, `progress-tile.tsx`, `episode-list.tsx`;
  - `src/lib/reader-learn.ts` (pure copy helpers, no i18n import).
- Modify:
  - `src/App.tsx`: the routes;
  - `src/lib/warm-up.ts`: `PAGE_LOADERS` gains `readerLearn`, `readerEpisode`, `readerSession`, the last a placeholder module until Task 10;
  - `src/lib/queries.ts`: `qk.readerLearn(id)` and `useReaderLearn(id)`;
  - `src/pages/home.tsx`: the card between the title/switcher and `WorldMap`;
  - `src/locales/nl.ts`, `src/locales/en.ts`: `readerLearn.*` keys;
  - `src/lib/types.ts`.
- Test: `tests/reader-learn-page.test.tsx`

**Interfaces:**
- Consumes: `ReaderLearn` (Task 3), `EpisodeMeta` (Task 5), `episodeAudioSource` and `ListenView` (Task 7).
- Produces:
  - routes `/reader/:id` (inside AppLayout) and `/reader/:id/episode/:week` (inside AppLayout, like the lesson listen view);
  - `/reader/:id/session` is registered in the StudyShell group, pointing at `PAGE_LOADERS.readerSession`;
  - `src/lib/reader-learn.ts` exports:
    - `examLabel(days: number | null): { key: string; n?: number }`: `null` → `readerLearn.exam.none`; 0 → `.today`; 1 → `.tomorrow`; >1 → `.inDays`; <0 → `.past`;
    - `estimateParts(e)`: the list of non-zero parts for the estimate line;
  - the home card only renders when a reader is selected, and links to `/reader/:id`.

- [ ] **Step 1: Write the failing tests:**
  - **`examLabel`:** each branch;
  - **`renderToString` of the page body** (export `ReaderLearnView({ data })`, pure props, no fetching), in nl and en:
    - with full data → contains the start button text, the countdown, "8 van 14" (nl), the episode titles and no `readerLearn.` raw keys;
    - with `needsStart` → the start-a-lesson state and no start button;
    - with no exam date, no episodes and no map → none of those sections;
    - with `today.done` → the done state and an "Extra ronde" button.
- [ ] **Step 2: Run** `bun test tests/reader-learn-page.test.tsx` and expect FAIL.
- [ ] **Step 3: Implement.**
  - The **episode screen** fetches `EpisodeMeta` and renders `ListenView` with `episodeAudioSource`. A 409 shows the calm "not available yet" state.
  - The **concept-map section** renders a placeholder slot `ReaderConceptMap`, lazy-imported, filled in Task 11; until then it renders nothing.
- [ ] **Step 4: Run** `bun test && bun run typecheck && bunx vite build && bun run budget` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): reader page, home card and episode player`

### Task 10: The daily session screen

**Files:**
- Create: `src/pages/reader-session.tsx`, `src/lib/session-runner.ts` (pure state reducer, no i18n)
- Modify: `src/locales/*`, `src/lib/queries.ts` (invalidate `readerLearn`, `readers`, `me` after submit and card ratings)
- Test: `tests/session-runner.test.ts`, plus a render smoke test in `tests/reader-learn-page.test.tsx`

**Interfaces:**
- Consumes: `ReaderSession` (Task 3), `ReviewCard` and `OpenQuestion` (Task 8), `QuestionPrompt`, `QuestionInput` and `GradeCard` (`src/components/quiz.tsx`, `question-input.tsx`; export them if not exported), `StudyShell`.
- Produces: `sessionReducer(state, action)` with these actions:
  - `{ type: "card-rated" }`, `{ type: "checked", correct: boolean }`, `{ type: "graded" }`, `{ type: "next" }`, `{ type: "submitted", result }`;
  - its state is `{ index, total, done: boolean, answered: Set<number>, result? }`;
  - `progress = answered / total`.

- [ ] **Step 1: Write the failing tests:**
  - **Reducer:**
    - progress advances only on answered items;
    - `next` past the last item sets `done`;
    - `submitted` stores the result.
  - **Render smoke:** the result view shows XP, `correct/total` and per-lesson rows with links to `/lesson/:id`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
  - On mount, fetch `/api/readers/:id/session`. When `needsStart` is true, navigate back to `/reader/:id`.
  - Questions use `POST /api/questions/:id/check` with the `sessionId`. Open items use `OpenQuestion` with the `sessionId`.
  - On the last item, `POST /session/submit`, then show the result.
  - Closing before the end asks for confirmation (the existing StudyShell `onClose` confirm pattern from the quiz). The rated cards stay saved.
  - Replace the Task 9 placeholder module in `PAGE_LOADERS.readerSession`.
- [ ] **Step 4: Run** `bun test && bun run typecheck && bunx vite build && bun run budget` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): mixed daily session screen`

### Task 11: Student concept map view

**Files:**
- Create: `src/components/reader-learn/concept-map.tsx`, `src/lib/concept-layout.ts` (pure)
- Modify: `src/pages/reader-learn.tsx` (fill the slot), locales
- Test: `tests/concept-layout.test.ts`

**Interfaces:**
- Consumes: the Task 6 student route response.
- Produces: `layoutConceptMap(data, lessons, width: number): { bands: { week: number; y: number; h: number }[]; nodes: { id: string; x: number; y: number; w: number; h: number; tone: "new"|"learning"|"mastered" }[]; edges: { from: string; to: string; d: string }[]; height: number }`.
  - Week bands run top to bottom by week ascending.
  - Nodes within a band wrap into rows that fit `width`; node width comes from the label length (`8 px × chars + 24`, capped at `width − 32`).
  - `tone` comes from lesson mastery: < 0.2 is `new`, < 0.8 is `learning`, otherwise `mastered`.
  - Edges are cubic curves between node centres.

- [ ] **Step 1: Write the failing tests:**
  - no two nodes overlap at width 358;
  - every node lies inside its week band;
  - bands are in week order;
  - the tones follow the mastery thresholds;
  - every edge `d` starts with `M`, and edges referring to missing nodes are dropped.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** the view:
  - an SVG edge layer behind absolutely positioned chip buttons;
  - tapping a chip opens a Drawer (on phones) or Dialog with the label, description, the links (tap to select the target and scroll it into view) and an "Open les <code>" link;
  - a week filter (Select) when there are more than 40 concepts;
  - an always-present visually hidden nested list for screen readers.
- [ ] **Step 4: Run** `bun test && bun run typecheck && bunx vite build && bun run budget` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): concept map view`

### Task 12: Admin "Leren" tab

**Files:**
- Create: `src/components/admin/reader-learn-tab.tsx`, `src/components/admin/concept-map-editor.tsx`, `src/lib/concept-edit.ts` (pure edit helpers)
- Modify: `src/pages/admin/reader.tsx` (Tabs: "Structuur" with the existing content unchanged, and "Leren"), locales
- Test: `tests/concept-edit.test.ts`

**Interfaces:**
- Consumes: the Task 1 PATCH `examDate`, the Task 4 episode admin routes, the Task 6 concept-map admin routes, `validateConceptMap` and `CONCEPT_LIMITS` (shared), and `SaveBar` (`src/components/admin/save-bar.tsx`, check its props).
- Produces: `src/lib/concept-edit.ts`:
  - `addConcept(d, lessonId)`, `removeConcept(d, id)` (also removes its links), `updateConcept(d, id, patch)`, `addLink(d, from, to, label)`, `removeLink(d, index)`;
  - all are pure and return a new `ConceptMapData`.

- [ ] **Step 1: Write the failing tests:**
  - `removeConcept` drops the links touching it;
  - `addConcept` respects `CONCEPT_LIMITS.concepts` (it returns the same object at the cap);
  - `addLink` refuses self-links and duplicates.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** the tab:
  - **Exam date:** an `<input type="date">` and a clear button. Convert the date to ms at 00:00 Europe/Amsterdam with a pure helper `examDateMs("2027-01-20")` (put it in `shared/reader-session.ts` and test it there: Europe/Amsterdam midnight in both winter and summer time).
  - **Episodes:** a table of weeks with status, a stale badge, duration, Generate/Regenerate, Play (`/reader/:id/episode/:week`) and Delete (with confirm), plus "Alle weken genereren". Poll every 2.5 s while any episode is `generating`.
  - **Concept map:** status and Generate. When `editedAt` is set, an AlertDialog confirms "Je handmatige wijzigingen gaan verloren". Then the list editor and the save bar. An inline error shows the server's validation code.
- [ ] **Step 4: Run** `bun test && bun run typecheck && bunx vite build && bun run budget` and expect PASS.
- [ ] **Step 5: Commit** `feat(reader-learning): admin tab for exam date, episodes and concept map`
