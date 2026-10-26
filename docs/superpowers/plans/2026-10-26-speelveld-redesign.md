# Speelveld Redesign + AI Settings Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every page of Windesheim Readers in the game-like "Speelveld" design:
- a floating dock on mobile and a floating rail on desktop;
- an upward lesson path, level bars, activity tiles and full-screen study mode;
- calm admin pages.

It also adds daily quests, and replaces hard-coded AI model lists with live,
key-validating provider model lists.

**Architecture:**
- Restyle shadcn/ui in place. Speelveld tokens go in `src/index.css`, `chunky`/`flat`
  variants go on Button and Card, and a few new layout and game components are added.
  Pages are then rebuilt on top of them.
- New pure logic lives in `shared/` and `server/` modules that are unit-tested with
  `bun test`. UI is verified by typecheck, build and screenshots.
- Backend additions:
  - a `quest_progress` table;
  - `server/ai/models.ts` for model listing and key validation;
  - a reader retry endpoint;
  - FSRS interval previews.

**Tech Stack:**
- Frontend: React 19, Vite 8, Tailwind v4, shadcn/ui (radix), TanStack Query, react-i18next.
- Backend: Hono on Bun, SQLite + Drizzle, ts-fsrs.
- AI: AI SDK v7.
- Libraries added by this plan: `@fontsource/fredoka`, `@fontsource/nunito`, `@dnd-kit/core`, `@dnd-kit/sortable`.

**Spec:** `docs/superpowers/specs/2026-10-26-speelveld-redesign-design.md`. Read it first: it holds the token table, every page decision and the provider endpoint table. This plan references it rather than repeating it.

## Global Constraints

- Keep shadcn/ui. Restyle through tokens and variants, and add missing primitives with `bunx shadcn@latest add <name>`. No other component kit.
- Colors are exactly the spec's token table, for light and dark.
- Fonts:
  - Fredoka 600/700 for headings, lesson codes, buttons and numbers;
  - Nunito 600/700/800 for body text;
  - self-hosted via `@fontsource`, with no Google Fonts CDN.
- Chunky style: a solid offset shadow `0 4–6px 0 <shade>` with no blur. On press, translate down by the shadow height and drop the shadow. Card radius 16–26px, button radius 14–18px.
- Lesson codes are always Fredoka in the primary color.
- No sidebar and no edge-attached tab bar.
  - Mobile (< `md`): a floating dock, inset 16px from the sides and the bottom (plus `env(safe-area-inset-bottom)`).
  - Desktop (≥ `md`): a floating left rail, vertically centred. Every item is a fixed 44×44 square with its icon centred, and the logo has the same width.
- Every published lesson is always open. Nothing is gated.
- Admin pages use the `flat` variant: 1px borders, no chunky shadows, 13–14px text. Only the primary action button is chunky.
- Every new user-facing string goes in both `src/locales/nl.ts` and `src/locales/en.ts`. `en.ts` is typed by `Messages`, so a missing key fails typecheck.
- The learning engine is unchanged:
  - FSRS scheduling;
  - XP constants in `shared/game.ts`;
  - `computeMastery`;
  - streak rules;
  - quiz session anti-cheat.
- Respect `prefers-reduced-motion`: chunky press, dock slide, card flip and sheet slide all become instant.
- `bun run typecheck`, `bun run build` and `bun test` stay green after every task.
- AI SDK packages stay on the npm `latest` dist-tag. Check with `npm view <pkg> version`.

## Review Focus

1. **Long text at 320–390px.** Long Dutch lesson titles, the "Makkelijk" rating label and long battle answers must wrap, never truncate or overflow. Task 14 screenshots each page at 360px, and Task 9's flashcard rating tile uses `min-w-0` and wraps.
2. **A user with no progress, or a reader with no published lessons.** Home must show an empty state, not crash. The path's "current" is the first lesson. This is pinned by `pathNodes` tests in Task 1.
3. **Quest day boundary at Amsterdam midnight.** Progress made at 23:30 UTC in winter (00:30 Amsterdam) belongs to the next day's quests. This is pinned by a `questsForDay` test in Task 2.
4. **The provider model-list call fails** (timeout, 429, or a 500 from the provider). The admin sees the error text and can still type a model id by hand; the page doesn't break. This is pinned by `listModels` error-mapping tests in Task 3.
5. **The floating dock covers page content or the iOS home indicator.** Every dock page needs bottom padding of at least dock height + 16px + safe area, so the last row stays reachable. Task 6 sets this in the shell, and Task 14 checks the last list item is fully visible.

---

## File Structure

**New shared logic** (tested in `tests/`):
- `shared/levels.ts`: lesson level from mastery, plus the next-step hint.
- `shared/path.ts`: builds path nodes (state, current, week groups) from lesson summaries.
- `shared/quests.ts`: the quest pool, deterministic daily pick, and progress rules.
- `shared/format.ts`: `formatInterval` for the rating tiles.

**New server modules:**
- `server/lib/quests.ts`: reads and writes `quest_progress`, records events, and awards completions.
- `server/ai/models.ts`: per-provider list and parse, key validation, and the cache.
- `server/ai/retry.ts`: the reader retry decision plus the action.

**New client components:**
- `src/components/shell/floating-dock.tsx`
- `src/components/shell/desktop-rail.tsx`
- `src/components/shell/study-shell.tsx`
- `src/components/game/level-bar.tsx`
- `src/components/game/lesson-path.tsx`
- `src/components/game/quest-card.tsx`
- `src/components/game/chip.tsx`
- `src/components/game/activity-tile.tsx`
- `src/components/game/feedback-sheet.tsx`
- `src/components/admin/save-bar.tsx`
- `src/components/admin/status-pill.tsx`
- `src/components/admin/model-combobox.tsx`

**Rewritten:**
- `src/index.css`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx`
- `src/components/app-layout.tsx`
- every file in `src/pages/` and `src/pages/admin/`
- `src/components/flashcard-session.tsx`, `quiz.tsx`, `question-input.tsx`, `tutor-tab.tsx`, `explain-tab.tsx`, `open-tab.tsx`

**Removed:**
- `src/components/mastery-ring.tsx` (replaced by `LevelBar`)
- `src/components/stat-chips.tsx` (replaced by `Chip`)
- `src/pages/learn.tsx` (the route redirects to `/`)

---

### Task 0: Branch and baseline commit

**Files:** Create `scripts/e2e/` (copied regression scripts).

- [ ] **Step 1:** `git checkout -b redesign/speelveld`
- [ ] **Step 2:** Copy the regression scripts out of volatile `/tmp` into the repo: `mkdir -p scripts/e2e && cp /tmp/wr-tools/{api-test,quiz-test,seed,ws-proxy}.ts scripts/e2e/`.
  - `api-test.ts` covers auth, roles, review, XP, leaderboard and a 3-player battle.
  - `quiz-test.ts` covers quiz anti-cheat.
  - `seed.ts <db-path>` seeds lessons.
  - `ws-proxy.ts` checks the WebSocket through the Vite proxy.
  
  Playwright for screenshots stays in `/tmp/wr-tools/node_modules`, and `~/.local/shot` points at it. If `/tmp` was wiped, reinstall it with `cd /tmp/wr-tools && npm i playwright`.
- [ ] **Step 3:** Commit the existing, never-committed app plus `scripts/e2e/` as the baseline:
  `git add -A && git commit -m "chore: baseline windesheim-readers app before Speelveld redesign"`.
  Before committing, check that `.gitignore` excludes `data/`, `.env` and `.superpowers/`.
  Expected: `git status` is clean, and `git ls-files data` prints nothing.

### Task 1: Shared level, path and interval logic

**Files:**
- Create: `shared/levels.ts`, `shared/path.ts`, `shared/format.ts`
- Test: `tests/levels.test.ts`, `tests/path.test.ts`, `tests/format.test.ts`
- Modify: `package.json` (add `"test": "bun test"`)

**Interfaces:**
- Consumes: `computeMastery` weights from `shared/game.ts` (quiz 0.4, cards 0.3, explain 0.2, read 0.1).
- Produces:
  - `lessonLevel(mastery: number): number`. Returns 0–5, computed as `Math.min(5, Math.floor(mastery * 5 + 1e-9))`.
  - `type NextStep = { kind: "cards" | "quiz" | "explain" | "read"; gain: number } | null`
  - `nextStep(p: { bestQuiz: number; bestExplain: number; summaryRead: boolean; cardMastery: number; cardsLeft: number }): NextStep`.
    Picks the component with the largest weighted remaining gain (`weight × (1 − value)`). Ties break in the order cards > quiz > explain > read. Returns `null` at mastery 1.
  - `type PathNodeState = "done" | "current" | "started" | "new"`
  - `interface PathNode { id: string; code: string; title: string; week: number; mastery: number; level: number; state: PathNodeState }`
  - `interface PathGroup { week: number; nodes: PathNode[] }`
  - `pathNodes(lessons: LessonSummaryLike[], lastStudiedLessonId: string | null): PathGroup[]`.
    `LessonSummaryLike = { id; code; title; week; mastery }`. Groups are in ascending week order, and nodes within a group follow input order. The client renders them reversed so the path climbs.
  - `DONE_MASTERY = 0.8`
  - `formatInterval(ms: number, locale: "nl" | "en"): string`

- [ ] **Step 1: Write failing tests**

```ts
// tests/levels.test.ts
expect(lessonLevel(0)).toBe(0); expect(lessonLevel(0.39)).toBe(1); expect(lessonLevel(0.4)).toBe(2);
expect(lessonLevel(1)).toBe(5);
expect(nextStep({ bestQuiz: 0, bestExplain: 0, summaryRead: false, cardMastery: 0, cardsLeft: 14 })?.kind).toBe("quiz"); // 0.4 > 0.3
expect(nextStep({ bestQuiz: 1, bestExplain: 1, summaryRead: true, cardMastery: 1, cardsLeft: 0 })).toBeNull();
expect(nextStep({ bestQuiz: 1, bestExplain: 0.25, summaryRead: true, cardMastery: 0.5, cardsLeft: 7 })?.kind).toBe("cards"); // 0.15 = 0.15 tie → cards
// tests/path.test.ts
const L = (id: string, week: number, mastery: number) => ({ id, code: id, title: id, week, mastery });
// no progress → first lesson current, rest new
expect(pathNodes([L("1.1A",1,0), L("1.1B",1,0)], null)[0].nodes.map(n => n.state)).toEqual(["current","new"]);
// last studied not done → current
expect(pathNodes([L("a",1,0.9), L("b",1,0.3), L("c",2,0)], "b").flatMap(g => g.nodes.map(n => n.state))).toEqual(["done","current","new"]);
// last studied is done → first not-done is current; started lessons keep "started"
expect(pathNodes([L("a",1,0.9), L("b",1,0.2), L("c",2,0)], "a").flatMap(g => g.nodes.map(n => n.state))).toEqual(["done","current","new"]);
expect(pathNodes([L("a",1,0.2), L("b",1,0), L("c",2,0)], "b").flatMap(g => g.nodes.map(n => n.state))).toEqual(["started","current","new"]);
// all done → no current
expect(pathNodes([L("a",1,1)], "a")[0].nodes[0].state).toBe("done");
expect(pathNodes([], null)).toEqual([]);
expect(pathNodes([L("a",2,0), L("b",1,0)], null).map(g => g.week)).toEqual([1,2]);
// tests/format.test.ts
expect(formatInterval(60_000, "nl")).toBe("1 min"); expect(formatInterval(8 * 60_000, "nl")).toBe("8 min");
expect(formatInterval(5 * 3600_000, "nl")).toBe("5 uur"); expect(formatInterval(2 * 86400_000, "nl")).toBe("2 dagen");
expect(formatInterval(86400_000, "nl")).toBe("1 dag"); expect(formatInterval(2 * 86400_000, "en")).toBe("2 days");
expect(formatInterval(45 * 86400_000, "nl")).toBe("1,5 mnd"); expect(formatInterval(400 * 86400_000, "en")).toBe("1.1 yr");
```

- [ ] **Step 2:** Run `bun test`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3:** Implement the three modules.
  - For `formatInterval`: under 1 hour → minutes (min 1); under 1 day → hours; under 30 days → days; under 365 days → months with one decimal (dropping ".0"); else years with one decimal.
  - Units: nl "min/uur/dag/dagen/mnd/jr", en "min/h/day/days/mo/yr".
  - Use a `,` decimal separator in nl. Exception: `en` years render as "yr", and hours as "h", for example "5 h".
- [ ] **Step 4:** Run `bun test` and `bun run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: shared level, path and interval helpers`.

### Task 2: Daily quests (backend)

**Files:**
- Create: `shared/quests.ts`, `server/lib/quests.ts`, `tests/quests.test.ts`
- Modify:
  - `server/db/schema.ts` (add the `questProgress` table);
  - new migration via `bun run db:generate` (it's created in `server/db/migrations/`);
  - `server/routes/learn.ts` (hook in events, and add quests to `GET /me`);
  - `server/live/battle.ts` (no quest events; battle XP only counts toward `earn_xp`);
  - `src/lib/types.ts` (`Me.quests`).

**Interfaces:**
- Produces in `shared/quests.ts`:
  - `type QuestId = "review_cards" | "quiz_80" | "explain_60" | "earn_xp" | "open_answer" | "two_lessons"`
  - `QUESTS: Record<QuestId, { target: number; reward: number }>`, with these exact values: review_cards 20/15, quiz_80 1/15, explain_60 1/15, earn_xp 60/10, open_answer 1/10, two_lessons 2/10.
  - `questsForDay(userId: string, dayKey: string): QuestId[]`. Returns 3 distinct ids, deterministic: seed a small PRNG (mulberry32) with a string hash (FNV-1a) of `userId + ":" + dayKey`, then Fisher–Yates over the ids in declaration order and take the first 3.
  - `type QuestEvent = { kind: "card_review" } | { kind: "quiz_submit"; pct: number; lessonId: string } | { kind: "explain"; score: number; lessonId: string } | { kind: "open"; lessonId: string } | { kind: "card_lesson"; lessonId: string } | { kind: "xp"; amount: number; reason: string }`
  - `applyEvent(q: QuestId, progress: number, seenLessons: string[], e: QuestEvent): { progress: number; seenLessons: string[] }`. This is pure.
    - `earn_xp` ignores `reason === "quest"`.
    - `two_lessons` counts distinct lessonIds from any lesson-scoped event.
    - `quiz_80` uses `pct >= 0.8`, and `explain_60` uses `score >= 60`.
- Produces in `server/lib/quests.ts`:
  - `recordQuestEvent(userId: string, e: QuestEvent): Promise<{ completed: QuestId[] }>`. Uses `dayKey()` from `server/lib/game.ts`. On a newly completed quest it calls `awardXp(userId, reward, "quest")`, then records an `{kind:"xp"}` event for the XP that was just awarded. That event is ignored by `earn_xp`.
  - `getQuests(userId: string): Promise<{ id: QuestId; target: number; reward: number; progress: number; done: boolean }[]>`
  - `XpResult` (server and client) gains `quests?: QuestId[]` (newly completed), so `celebrate()` can toast them.
- Table `quest_progress`: `userId` text FK→user (cascade), `dayKey` text, `questId` text, `progress` integer default 0, `seenLessons` text json default `[]`, `completedAt` timestamp nullable. Primary key (userId, dayKey, questId).

- [ ] **Step 1: Write failing tests**

```ts
expect(questsForDay("u1","2026-10-26")).toEqual(questsForDay("u1","2026-10-26"));
expect(new Set(questsForDay("u1","2026-10-26")).size).toBe(3);
expect(questsForDay("u1","2026-10-26")).not.toEqual(questsForDay("u1","2026-10-27")); // pick fixtures where this holds; assert over 7 days at least 2 distinct sets
expect(applyEvent("earn_xp", 50, [], { kind: "xp", amount: 15, reason: "quest" }).progress).toBe(50);
expect(applyEvent("earn_xp", 50, [], { kind: "xp", amount: 15, reason: "quiz" }).progress).toBe(65);
expect(applyEvent("quiz_80", 0, [], { kind: "quiz_submit", pct: 0.79, lessonId: "a" }).progress).toBe(0);
expect(applyEvent("quiz_80", 0, [], { kind: "quiz_submit", pct: 0.8, lessonId: "a" }).progress).toBe(1);
const s1 = applyEvent("two_lessons", 0, [], { kind: "card_lesson", lessonId: "a" });
const s2 = applyEvent("two_lessons", s1.progress, s1.seenLessons, { kind: "quiz_submit", pct: 0, lessonId: "a" });
expect(s2.progress).toBe(1);
expect(applyEvent("two_lessons", s2.progress, s2.seenLessons, { kind: "open", lessonId: "b" }).progress).toBe(2);
// Review Focus 3: Amsterdam midnight
import { dayKey } from "../server/lib/game";
expect(dayKey(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
```

- [ ] **Step 2:** Run `bun test tests/quests.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `shared/quests.ts`, then add the table and generate the migration (`bun run db:generate`, and check the SQL), then implement `server/lib/quests.ts`.
- [ ] **Step 4:** Hook up events in `server/routes/learn.ts`. Each awardXp site also calls `recordQuestEvent`, and its `completed` list is merged into the response as `quests`:
  - card review → `card_review` + `card_lesson`;
  - quiz submit → `quiz_submit` with `pct = correct/max`;
  - explain → `explain`;
  - open grade → `open`;
  - every `awardXp` → `xp`. Do this inside a small helper `award(userId, amount, reason, events)` in learn.ts so each site is one call.
  
  Battle XP only records `{kind:"xp"}`. `GET /me` adds `quests: await getQuests(u.id)`.
- [ ] **Step 5:** Run `bun test`, `bun run typecheck`, then `bun scripts/e2e/api-test.ts` and `bun scripts/e2e/quiz-test.ts` against `bun run dev`. Expected: all pass, and `/api/me` includes 3 quests.
- [ ] **Step 6:** Commit `feat: daily quests`.

### Task 3: AI model listing, key validation, and test fix (backend)

**Files:**
- Create: `server/ai/models.ts`, `tests/models.test.ts`, `tests/fixtures/models/{google,anthropic,openai,openrouter}.json` (small real-shaped samples, including entries that must be filtered out)
- Modify: `server/ai/providers.ts` (remove `MODEL_SUGGESTIONS`; `DEFAULT_MODEL: Record<ProviderId,string>` = google `gemini-2.5-flash`, anthropic `claude-sonnet-5-5`, openai `gpt-5-mini`, openrouter `google/gemini-2.5-flash`; export `resolveApiKey(provider, typedKey?)`), `server/routes/admin.ts`, `src/lib/types.ts`
- Modify: `package.json`. Bump `ai`, `@ai-sdk/*` and `@openrouter/ai-sdk-provider` to the current `npm view <pkg> version` if it's newer, then `bun install`.

**Interfaces:**
- Produces in `server/ai/models.ts`:
  - `interface ModelInfo { id: string; name: string; contextWindow?: number; maxOutput?: number; created?: number /* epoch ms */; deprecated?: boolean; structuredOutput?: boolean }`
  - Pure parsers, one per provider response body. Each returns `ModelInfo[]` sorted by `created` desc, then `id`:
    - `parseGoogle(json)`
    - `parseAnthropic(json)`
    - `parseOpenAI(json)`
    - `parseOpenRouter(json)`
  
  The filters are exactly those in the spec's provider table.
  - `class ProviderAuthError extends Error` (on 401/403), and `class ProviderError extends Error { status?: number }`.
  - `listModels(provider: ProviderId, apiKey: string | undefined, opts?: { refresh?: boolean; fetchImpl?: typeof fetch }): Promise<ModelInfo[]>`
    - 10s `AbortSignal.timeout`.
    - Follows pagination: Google uses `nextPageToken`, and Anthropic uses `has_more`/`last_id`.
    - In-memory cache for 1h, keyed by `provider + sha256(apiKey).slice(0,16)`.
    - OpenRouter needs no key for listing.
  - `validateKey(provider, apiKey, opts?): Promise<{ ok: true; modelCount: number } | { ok: false; invalid: boolean; error: string }>`
    - OpenRouter calls `GET /api/v1/key`, and the others call `listModels` with `refresh: true`.
    - `invalid` is true only for `ProviderAuthError`.
- Admin routes, all `requireAdmin`. In each, `apiKey` is an optional typed key that falls back to the stored or env key:
  - `POST /admin/settings/ai/validate {provider, apiKey?}`
  - `POST /admin/settings/ai/models {provider, apiKey?, refresh?}` returns `ModelInfo[]`, or `{error}` with status 502.
  - `POST /admin/settings/ai/test {provider, model, apiKey?}` (unchanged contract; client fixed in Task 13).
- `AiSettings` (server public and client type) drops `suggestions` and gains `defaults: Record<ProviderId,string>`.

- [ ] **Step 1: Write failing tests**

```ts
// parsers (fixtures include an embedding model, a tts model, a retired Claude, an image-only OpenRouter model)
const g = parseGoogle(googleFixture);
expect(g.map(m => m.id)).toContain("gemini-2.5-flash"); expect(g.some(m => m.id.includes("embedding"))).toBe(false);
expect(g.find(m => m.id === "gemini-2.5-flash")?.contextWindow).toBe(1048576);
const a = parseAnthropic(anthropicFixture);
expect(a.some(m => m.id === "claude-retired-x")).toBe(false); expect(a.find(m => m.id === "claude-old-dep")?.deprecated).toBe(true);
expect(a.find(m => m.id === "claude-opus-5-5")?.structuredOutput).toBe(true);
const o = parseOpenAI(openaiFixture);
expect(o.map(m => m.id).sort()).toEqual(["gpt-5", "gpt-5-mini", "o4-mini"]); // fixture also has text-embedding-3-large, tts-1, whisper-1, dall-e-3, gpt-4o-realtime-preview, omni-moderation-latest
const r = parseOpenRouter(openrouterFixture);
expect(r.some(m => m.id === "some/image-only")).toBe(false); expect(r.find(m => m.id === "google/gemini-2.5-flash")?.structuredOutput).toBe(true);
// Review Focus 4: error mapping via fetchImpl
const f401 = (async () => new Response("{}", { status: 401 })) as typeof fetch;
await expect(listModels("openai", "bad", { fetchImpl: f401, refresh: true })).rejects.toBeInstanceOf(ProviderAuthError);
const f429 = (async () => new Response("rate", { status: 429 })) as typeof fetch;
await expect(listModels("openai", "k", { fetchImpl: f429, refresh: true })).rejects.toBeInstanceOf(ProviderError);
expect(await validateKey("openai", "bad", { fetchImpl: f401 })).toEqual({ ok: false, invalid: true, error: expect.any(String) });
expect((await validateKey("openai", "k", { fetchImpl: f429 })) ).toMatchObject({ ok: false, invalid: false });
// pagination: anthropic has_more twice → all pages concatenated
```

- [ ] **Step 2:** Run `bun test tests/models.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `server/ai/models.ts`, update `providers.ts` and the routes, and bump the packages.
- [ ] **Step 4:** Run `bun test`, `bun run typecheck`, `bun run build`. Expected: PASS.

  Then make a manual call against dev with a bogus key: `curl -s -XPOST localhost:3000/api/admin/settings/ai/validate` (with an admin session cookie from `scripts/e2e/seed.ts`) and the body `{"provider":"google","apiKey":"bogus"}`. Expected: `{"ok":false,"invalid":true,...}`.
- [ ] **Step 5:** Commit `feat: live provider model lists and key validation`.

### Task 4: Reader retry endpoint and FSRS interval previews (backend)

**Files:**
- Create: `server/ai/retry.ts`, `tests/retry.test.ts`
- Modify: `server/ai/pipeline.ts` (export `extractAndStructure(readerId)`, which reads the stored PDF from `UPLOAD_DIR` and runs `extractPdf` then `proposeStructure`), `server/routes/admin.ts`, `server/routes/learn.ts`, `src/lib/types.ts`

**Interfaces:**
- Produces:
  - `retryAction(reader: { status: ReaderStatus; error: string | null }, lessons: { id: string; status: LessonStatus }[]): { kind: "extract" } | { kind: "generate"; lessonIds: string[] } | { kind: "none" }`. This is pure. The mapping is exactly the spec's admin "Opnieuw proberen" mapping:
    - error with no lessons → extract;
    - error with lessons → generate the error/pending lessons;
    - ready with an error → generate the error/pending lessons;
    - otherwise → none.
    
    **It never returns an action that deletes lessons.**
  - `POST /admin/readers/:id/retry` returns `{ action: kind }` and starts the job in the background. It uses the same background pattern as upload.
  - `AdminReader` gains `failedCount: number` (lessons in error), used for the "Deels mislukt" pill.
  - `QueueCard` gains `intervals: { again: number; hard: number; good: number; easy: number }`, in ms from now, computed with ts-fsrs `f.repeat(card, now)[Rating.X].card.due - now`. New cards use an empty card.

- [ ] **Step 1: Write failing tests**

```ts
expect(retryAction({ status: "error", error: "x" }, [])).toEqual({ kind: "extract" });
expect(retryAction({ status: "error", error: "x" }, [{ id: "a", status: "ready" }, { id: "b", status: "error" }, { id: "c", status: "pending" }])).toEqual({ kind: "generate", lessonIds: ["b", "c"] });
expect(retryAction({ status: "ready", error: "1 lesson(s) failed" }, [{ id: "a", status: "error" }])).toEqual({ kind: "generate", lessonIds: ["a"] });
expect(retryAction({ status: "ready", error: null }, [{ id: "a", status: "ready" }])).toEqual({ kind: "none" });
expect(retryAction({ status: "error", error: "x" }, [{ id: "a", status: "ready" }])).toEqual({ kind: "none" });
```

- [ ] **Step 2:** Run `bun test tests/retry.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire up the endpoint and the queue intervals.
- [ ] **Step 4:** Run `bun test`, `bun run typecheck`, `bun scripts/e2e/api-test.ts`. Expected: PASS, and `/api/review/queue` cards include `intervals` with `again < good < easy`.
- [ ] **Step 5:** Commit `feat: safe reader retry and FSRS interval previews`.

### Task 5: Speelveld design tokens, fonts and variants

**Files:**
- Modify: `src/index.css` (`:root` and `.dark` tokens from the spec's table, mapped onto shadcn variables)
  - Mapping: `--background`, `--card`, `--popover`, `--foreground`, `--muted-foreground`, `--primary` and the rest.
  - Add Speelveld extras: `--chunky`, `--primary-shade`, `--success`/`--success-shade`, `--warning`/`--warning-shade`, `--danger`/`--danger-shade`, `--info`/`--info-shade`, `--gold`/`--gold-shade`, `--track`.
  - Set `--font-sans: "Nunito"`, `--font-heading: "Fredoka"`, `--radius: 1rem`.
  - Remove the old flip-card and indigo theme.
- Modify: `src/main.tsx` (import `@fontsource/fredoka/600.css`, `700.css` and `@fontsource/nunito/600.css`, `700.css`, `800.css`)
- Modify: `src/components/ui/button.tsx`
  - New variants: `chunky` (primary fill with a primary-shade offset shadow), `chunky-success`, `chunky-danger`, `chunky-surface` (card fill with a `--chunky` shadow), and `flat` (1px border, surface).
  - New sizes: `xl` (h-12, Fredoka 16px, radius 16px) and `icon-xl` (44×44).
  - The pressed state uses `active:translate-y-[var(--press)] active:shadow-none` and is disabled under `motion-reduce`.
- Modify: `src/components/ui/card.tsx` (a `variant` prop: `chunky` (default for student pages) | `flat`)
- Delete: the `cn` package import only if shadcn re-adds `@/lib/utils`. Otherwise leave it.

- [ ] **Step 1:** `bun add @fontsource/fredoka @fontsource/nunito`
- [ ] **Step 2:** Implement the tokens and variants.
- [ ] **Step 3:** Run `bun run typecheck && bun run build`. Expected: PASS.
- [ ] **Step 4:** Screenshot-check: start `bun run dev`, log in via `scripts/e2e/seed.ts`, then run `~/.local/shot/shot.sh` on the home page at 390 and 1280, in light and dark (set the theme via `localStorage.theme`). Expected: Fredoka headings, lilac/grape backgrounds, no unstyled text. Pages are still the old layouts, which is fine.
- [ ] **Step 5:** Commit `feat: Speelveld tokens, fonts and chunky variants`.

> **Screenshot helper note:** `~/.local/shot/shot.sh <file-or-url> <out.png> [width] [light|dark]` exists and works with the local Chromium libs. Extend `~/.local/shot/shot.mjs` to accept `http(s)://` URLs and a cookie file (`--cookie <path>`) for authenticated pages. That's a helper change outside the repo, so do it once in this task.

### Task 6: App shell: floating dock, desktop rail, study shell, routing

**Files:**
- Create: `src/components/shell/floating-dock.tsx`, `src/components/shell/desktop-rail.tsx`, `src/components/shell/study-shell.tsx`
- Rewrite: `src/components/app-layout.tsx`
- Modify: `src/App.tsx` (`/learn` → `<Navigate to="/" replace />`; study routes are rendered without dock or rail)
- Delete: `src/pages/learn.tsx`

**Interfaces:**
- `NAV_ITEMS`: `{ to: "/", key: "path", icon: House }`, `/review` (with the due badge from `useMe().stats.due`), `/battle`, `/leaderboard`, `/profile`, plus `/admin` (Shield) when `role === "admin"`. Add the `nav.path: "Pad" / "Path"` i18n key.
- `<FloatingDock items />`:
  - `md:hidden`, fixed, `inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))]`.
  - The active item is a primary chunky pill with its label. Inactive items are icon-only 44×44 with an `aria-label`.
  - The pill animates between items (a CSS transition on a measured offset; instant under reduced motion).
- `<DesktopRail items />`: `hidden md:flex`, fixed left 16px, vertically centred. Each child is `size-11 grid place-items-center`, the logo is the same `size-11`, and there's a divider before admin.
- `<StudyShell onClose progress={0..1} counter? right?>{children}</StudyShell>`: a full-viewport layout with ✕, a chunky progress bar and a slot. It hides the dock and rail because it's rendered outside `AppLayout`.
- `AppLayout` content padding:
  - `pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-8 md:pl-28`;
  - max width `max-w-5xl` for student pages and `max-w-6xl` for admin.

- [ ] **Step 1:** Implement the components and routing.
- [ ] **Step 2:** Run `bun run typecheck && bun run build`. Expected: PASS.
- [ ] **Step 3:** Take screenshots at 360, 390 and 1280. Expected:
  - The dock floats with a 16px inset.
  - Rail icons are centred: compare each icon's bounding box centre to its 44px cell, with a 1px tolerance. Check this with a Playwright `evaluate` in the shot script, or visually at 2× scale.
  - **Review Focus 5:** On a long page (leaderboard with 20 seeded users), scrolled to the bottom, the last row sits fully above the dock.
- [ ] **Step 4:** Commit `feat: floating dock, desktop rail and study shell`.

### Task 7: Home: lesson path, quests, desktop right column

**Files:**
- Create: `src/components/game/chip.tsx`, `src/components/game/level-bar.tsx`, `src/components/game/lesson-path.tsx`, `src/components/game/quest-card.tsx`
- Rewrite: `src/pages/home.tsx`
- Modify: `server/routes/learn.ts` (`GET /readers` adds `lastStudiedLessonId: string | null` per reader. It's derived from the user's most recent `attempt`, `card_review` or `lesson_progress` update for that reader's lessons.)
- Modify: `src/lib/types.ts`, locales
- Delete: `src/components/stat-chips.tsx`, `src/components/mastery-ring.tsx`. Remove their remaining imports when the later tasks rewrite those pages; until then keep the files and delete them in Task 12.

**Interfaces:**
- Consumes: `pathNodes`, `lessonLevel` (Task 1), and `Me.quests` (Task 2).
- `<Chip tone="streak|level|xp">`
- `<LevelBar level={0..5} size="sm|lg" label? hint? />`. It renders 5 chunky segments. `sm` is the mini bar under path nodes.
- `<LessonPath groups={PathGroup[]} onOpen(id) />`:
  - renders groups and nodes **reversed** (newest at the top), zig-zagging left and right;
  - each group has a "Week n" divider;
  - the current node gets a ring and a "Ga verder" bubble;
  - on mount it scrolls the current node into the centre (`scrollIntoView({block:"center"})`, with no smooth scroll under reduced motion).
- `<QuestCard quests />`
- Home layout:
  - mobile: chips row → daily goal → quest card → reader switcher (when more than 1 reader) → path;
  - desktop: path in the centre column, and a right column (w-72) with daily goal, quests, and the week leaderboard top 3 plus your own row (from `/api/leaderboard?period=week`).
  - Empty state when there are no readers (Review Focus 2): the existing `home.noReaders` / `noReadersAdmin` copy in a chunky card.
- `src/lib/celebrate.ts`: when an `XpResult` has `quests`, toast "Quest voltooid: {{name}} +{{xp}} XP" (new locale keys `quests.done`, plus `quests.names.<QuestId>` with Dutch/English names matching the spec's quest table). This is the single celebratory moment, and it's reused for level-up.

- [ ] **Step 1:** Implement and wire up.
- [ ] **Step 2:** Run `bun run typecheck && bun run build`. Expected: PASS.
- [ ] **Step 3:** Screenshots at 390 and 1280, light and dark, against seeded data. Expected:
  - matches `.superpowers/mockups/path-v2.html` and `directions.html` (B);
  - done lessons at the bottom;
  - the page opens scrolled to the current lesson;
  - with zero progress, the first lesson is current.
- [ ] **Step 4:** Commit `feat: home lesson path with quests`.

### Task 8: Lesson page: level header, activity tiles, reading view

**Files:**
- Create: `src/components/game/activity-tile.tsx`
- Rewrite: `src/pages/lesson.tsx`
- Restyle: `explain-tab.tsx`, `open-tab.tsx`, `tutor-tab.tsx`, `grade-card.tsx`, `markdown.tsx`. These are the same components, now opened as sub-views.
- Modify: locales (next-step sentences: `lesson.next.cards` "Leer nog {{n}} kaarten voor niveau {{level}}", `.quiz` "Haal een hogere quizscore voor niveau {{level}}", `.explain` "Leg een begrip uit voor niveau {{level}}", `.read` "Lees de samenvatting voor niveau {{level}}", `.max` "Je beheerst deze les!")

**Interfaces:**
- Consumes: `lessonLevel`, `nextStep` (Task 1), `LevelBar` (Task 7).
- The URL is `/lesson/:id?view=read|explain|open|tutor`. With no `view`, it shows the tiles. Kaarten → `/lesson/:id/cards` and Quiz → `/lesson/:id/quiz` (StudyShell routes, Task 9).
- `<ActivityTile icon tone title status highlighted? onClick />`. The `highlighted` tile is filled primary and matches `nextStep(...).kind`.
- `cardsLeft` for `nextStep` comes from `flashcardCount × (1 − cardMastery)`, rounded up.
- The prev/next lesson links stay at the bottom of the read view.
- Desktop (≥ md): two columns. The left one has the header card (code, title, level bar) above the key points. The right one has a `chunky` `xl` "start next step" button above the remaining tiles in 2 columns. This matches the spec's desktop lesson layout.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `bun run typecheck && bun run build`. Expected: PASS.
- [ ] **Step 3:** Screenshots at 390 and 1280. Expected: matches `cards-v3.html` (right phone). The level bar shows "Niveau n van 5" with a hint line, and no % ring remains anywhere (`grep -r MasteryRing src` is empty).
- [ ] **Step 4:** Commit `feat: lesson page with level bar and activity tiles`.

### Task 9: Full-screen study: flashcards, quiz, review

**Files:**
- Create: `src/components/game/feedback-sheet.tsx`
- Rewrite: `src/components/flashcard-session.tsx`, `src/components/quiz.tsx`, `src/components/question-input.tsx`, `src/pages/review.tsx`
- Modify: `src/App.tsx` (routes `/lesson/:id/cards`, `/lesson/:id/quiz`, `/review` all inside `StudyShell`), locales (`cards.hard` → "Lastig"/"Hard")

**Interfaces:**
- Consumes: `QueueCard.intervals` (Task 4), `formatInterval` (Task 1), and `StudyShell` (Task 6).
- Flashcards:
  - flip on tap or Space;
  - after the flip, a 2×2 rating grid at the bottom: again/pink, hard/orange, good/mint, easy/blue. Each tile has an icon, a label and `formatInterval(intervals[r], locale)`;
  - each tile is `min-w-0` and wraps, and must not truncate at 320px;
  - keys 1–4 still rate, but are ignored while focus is in an input or textarea;
  - **swipe:** pointer drag on the flipped card. More than 100px right → good, less than −100px → again. The card tilts and shows a stamp while dragging and springs back below the threshold. Swipe is disabled before the flip.
- Quiz:
  - answer options are `chunky-surface` blocks, and the selected one gets a primary border;
  - after `check`, `<FeedbackSheet tone="success|danger" title body onNext />` slides up from the bottom, and the full-width button says "Volgende" (or "Resultaat" on the last question);
  - a combo chip "{{n}}x" appears in the StudyShell right slot when n ≥ 2;
  - the session/check/submit API flow is unchanged.
- Results screen: score, XP gained, quests completed (from `XpResult.quests`) and "Nieuwe quiz".

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `bun run typecheck && bun run build`, then `bun scripts/e2e/quiz-test.ts`. Expected: PASS, with anti-cheat unchanged.
- [ ] **Step 3:** Screenshots at 320, 390 and 1280: flipped flashcard, quiz with the correct-answer sheet, quiz with the wrong-answer sheet, and the results screen. Expected: matches `cards-v3.html` (left) and `dark.html` (right). No truncated labels at 320 (Review Focus 1). No dock visible.
- [ ] **Step 4:** Commit `feat: full-screen flashcards and quiz`.

### Task 10: Leaderboard, profile, login

**Files:** Rewrite `src/pages/leaderboard.tsx`, `src/pages/profile.tsx`, `src/pages/login.tsx`. Modify locales as needed.

**Interfaces:**
- Leaderboard:
  - a podium for ranks 1–3 (gold, silver `#A9B6CF`, bronze `#E59B62` steps, with the 1st step tallest and in the centre);
  - then a list starting at rank 4, with your own row outlined in primary;
  - when you're in the top 3, your own row is still highlighted on the podium (with a ring around the avatar);
  - a chunky segmented toggle for week and all time;
  - the existing `resets` and `hidden` notes as small muted text below the list.
- Profile:
  - an avatar with initials, the display name and `levelTitle`;
  - 3 stat tiles: total XP, streak and longest streak;
  - a badge grid with 4 columns, where unearned badges use the `--track` fill and muted icons. Tapping a badge opens a popover with its name and description;
  - a settings card: nickname, leaderboard toggle, language, theme and sign out.
- Login: the stacked-cards logo (two rotated chunky rectangles, the front one reading "1.2A"), name, tagline, email field and a `chunky` `xl` button. The sent and error states sit in the same card.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `bun run typecheck && bun run build`. Expected: PASS.
- [ ] **Step 3:** Screenshots at 390 and 1280, light and dark. Expected: matches `student-pages.html`. Long nicknames (24 characters) are truncated with an ellipsis in list rows, not overflowing.
- [ ] **Step 4:** Commit `feat: leaderboard, profile and login in Speelveld style`.

### Task 11: Battle

**Files:** Rewrite `src/pages/battle.tsx` (it may be split into `src/pages/battle/{index,lobby,play,podium}.tsx`). The WebSocket protocol is unchanged.

**Interfaces:**
- Every battle screen uses a dark stage (`#2A1C6B` background, white text) in both themes, rendered inside `StudyShell` once joined. The join and host screens stay in the normal shell.
- Play:
  - a countdown ring (conic gradient, gold) showing the remaining seconds;
  - "Vraag i van n", the points total, the question, and "{{a}} van {{n}} spelers hebben geantwoord";
  - four answer blocks: triangle/pink, diamond/blue, circle/gold, square/mint. They're 2×2 on mobile and 4 in a row at ≥ md. True/false shows 2 blocks.
- Lobby: a big Fredoka code, the join instructions and player chips. Podium: the same podium component as the leaderboard (extract it to `src/components/game/podium.tsx` in Task 10 and reuse it here).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `bun run typecheck && bun run build`, then `bun scripts/e2e/api-test.ts` (includes the 3-player battle) and `bun scripts/e2e/ws-proxy.ts` (with `bun run dev` running). Expected: PASS.
- [ ] **Step 3:** Screenshots of the lobby, a play question and the podium at 390 and 1280. Expected: matches `student-pages.html` (battle).
- [ ] **Step 4:** Commit `feat: battle stage redesign`.

### Task 12: Admin: readers, structure editor, lesson editor, users

**Files:**
- Create: `src/components/admin/status-pill.tsx`, `src/components/admin/save-bar.tsx`
- Rewrite: `src/pages/admin/readers.tsx`, `src/pages/admin/reader.tsx`, `src/pages/admin/lesson.tsx`, `src/pages/admin/users.tsx`, `src/components/admin-status.tsx` (merged into `status-pill`)
- Create: `src/pages/admin/layout.tsx` (title "Beheer" with the segmented tabs Readers / AI-instellingen / Gebruikers)
- Delete: `src/components/stat-chips.tsx`, `src/components/mastery-ring.tsx` (if unused)
- `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

**Interfaces:**
- Consumes: `POST /admin/readers/:id/retry` and `AdminReader.failedCount` (Task 4).
- `<StatusPill status>` maps reader state to pill:

| Reader state | Pill |
|---|---|
| published + ready | Gepubliceerd (success) |
| ready, unpublished | Klaar (track) |
| `failedCount > 0` or a ready reader with an error | **Deels mislukt** (warning) |
| generating | Content genereren (warning, with progress `readyCount/lessonCount`) |
| review | Indeling controleren (track) |
| extracting / structuring | busy |
| error | Fout (danger) |

- Readers page:
  - a card grid with 3 columns at lg, 2 at md and 1 on mobile, using flat cards;
  - **a page-level drop zone**: dragging a `.pdf` anywhere opens the existing upload dialog with the file prefilled. Non-PDFs show a toast;
  - "Opnieuw proberen" appears on Fout and Deels mislukt.
- Structure editor:
  - a table whose cells become inputs on click;
  - row reorder via a dnd-kit sortable handle;
  - `<SaveBar dirty onSave onReset />` slides up from the bottom when dirty, above the dock on mobile, with "Opslaan" and "Ongedaan maken";
  - generate buttons stay disabled while dirty (existing rule);
  - the save still calls the existing `PUT /admin/readers/:id/lessons`.
- Users: a flat table with avatar, name/email, XP, joined date and a role `Switch`. Env admins show a locked pill.
- All admin pages use the flat Card/Button variants.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `bun run typecheck && bun run build`. Expected: PASS.
- [ ] **Step 3:** Exercise against dev with seeded data:
  1. Drag a PDF onto the readers page; the dialog opens prefilled.
  2. Reorder two lessons; the save bar appears.
  3. "Ongedaan maken" restores the original order.
  4. "Opslaan" persists it. Check after a reload.
  5. Retry on an errored, lesson-less reader returns `{action:"extract"}`.
- [ ] **Step 4:** Screenshots at 1280 and 390. Expected: matches `admin-pages.html`. The mobile structure table scrolls horizontally inside its card, not the whole page.
- [ ] **Step 5:** Commit `feat: calm admin pages with drag-drop upload, reorder and save bar`.

### Task 13: Admin AI settings UI

**Files:**
- Create: `src/components/admin/model-combobox.tsx` (`bunx shadcn@latest add command popover` if missing)
- Rewrite: `src/pages/admin/settings.tsx`
- Modify: locales (`admin.ai.keyInvalid` "Ongeldig"/"Invalid", `admin.ai.refresh` "Vernieuwen"/"Refresh", `admin.ai.validating`, `admin.ai.saveInvalidConfirm`, `admin.ai.noStructured` "Dit model meldt geen ondersteuning voor gestructureerde output; contentgeneratie kan mislukken.", `admin.ai.customModel` "Gebruik '{{id}}'")

**Interfaces:**
- Consumes the endpoints from Task 3.
- Key rows:
  - Typing a key debounces 600ms, then calls `/validate` with the typed key. The pill shows Controleren… → Geldig (n modellen) or **Ongeldig**, or the error text when `invalid:false`.
  - Saving a key whose last validation was `invalid:true` asks for confirmation via AlertDialog.
- `<ModelCombobox provider apiKey? value onChange />`:
  - fetches `/models` (passing the typed key if present);
  - searchable, each row showing the name, id and context size (for example "1M ctx");
  - deprecated models get a muted "verouderd" tag;
  - "Vernieuwen" calls with `refresh: true`;
  - typing an id not in the list offers "Gebruik '{{id}}'";
  - on fetch error it shows the error inline, and free text still works (Review Focus 4).
- When the provider changes, the model resets to `defaults[provider]`.
- The Test button posts `{provider, model, apiKey: typedKey || undefined}`.
- The generation role card shows the `noStructured` warning when the selected `ModelInfo.structuredOutput === false`. It stays quiet when the value is undefined.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `bun run typecheck && bun run build`. Expected: PASS.
- [ ] **Step 3:** Manual check against dev:
  1. Paste "bogus" into the Gemini key field; it shows Ongeldig.
  2. Open the OpenRouter model combobox with no key; the list loads, because it's a public endpoint.
  3. Type a custom id; "Gebruik '…'" appears.
  4. Press Test with an unsaved typed bogus key; the error mentions an auth failure, **not** "No API key configured".
- [ ] **Step 4:** Screenshot at 1280 and 390. Expected: matches `admin-pages.html` (AI settings).
- [ ] **Step 5:** Commit `feat: AI settings with live model lists and key validation`.

### Task 15: Magic-link email redesign (owner addendum; run after Task 10)

**Files:**
- Create: `server/emails/magic-link.tsx`, `scripts/email-preview.ts`, `tests/email.test.ts`
- Modify: `server/lib/email.ts`, `server/auth.ts` (pass the locale), `tsconfig.json` (if the server needs `.tsx`; `jsx: react-jsx` is already set for src)
- `bun add @react-email/components @react-email/render`

**Interfaces:**
- `renderMagicLinkEmail({ url, locale }: { url: string; locale: "nl" | "en" }): Promise<{ subject: string; html: string; text: string }>`
- `sendMagicLinkEmail(to: string, url: string)` keeps its signature. It resolves the locale itself: it looks up `user.locale` by email and falls back to `"nl"`. It attaches `public/brand/logo-email.png` as `{ filename: "logo.png", content: <base64>, contentId: "logo" }`.
- The dev fallback log format `\n[magic-link] ${to}\n  ${url}\n` stays byte-identical.

- [ ] **Step 1: Write failing tests**

```ts
const nl = await renderMagicLinkEmail({ url: "https://x.test/verify?token=abc&cb=%2F", locale: "nl" });
expect(nl.subject).toBe("Je inloglink voor Windesheim Readers");
expect(nl.html).toContain('src="cid:logo"');
expect(nl.html).toContain('href="https://x.test/verify?token=abc&amp;cb=%2F"');
expect(nl.html).toContain("15 minuten");
expect(nl.html).toContain('name="color-scheme"');
expect(nl.html.toLowerCase()).toContain("#6b3cf6");
expect(nl.html.toLowerCase()).toContain("border-bottom:4px solid #4a22c4");
expect(nl.text).toContain("https://x.test/verify?token=abc&cb=%2F");
expect(nl.html).not.toContain("Sign in"); // single language
const en = await renderMagicLinkEmail({ url: "https://x.test/v", locale: "en" });
expect(en.subject).toBe("Your Windesheim Readers sign-in link");
expect(en.html).toContain("15 minutes");
```

- [ ] **Step 2:** Run `bun test tests/email.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the template to match the spec addendum "Magic-link email redesign", then the sender, then the preview script.
- [ ] **Step 4:** Run `bun test`, `bun run typecheck`, `bun run build`, `bun run test:e2e`. The e2e depends on the unchanged log format. Expected: PASS.
- [ ] **Step 5:** Run `bun scripts/email-preview.ts`, then screenshot `/tmp/email-preview-nl.html` at 390 and 600, light and dark. Expected: the logo shows, the chunky card and button look right, the long fallback link wraps, and dark mode is readable. **Do not send real email** in this task.
- [ ] **Step 6:** Commit `feat: redesigned magic-link email`.

### Task 14: Full verification pass and demo redeploy

**Files:** fixes only, wherever the pass finds problems.

- [ ] **Step 1:** Run `bun test && bun run typecheck && bun run build`. Expected: all PASS.
- [ ] **Step 2:** Run the regression scripts in `scripts/e2e/` against dev: `api-test.ts` (includes battle), `quiz-test.ts` and `ws-proxy.ts`. Expected: PASS.
- [ ] **Step 3:** Screenshot matrix: every route (login, home, lesson tiles, lesson read, cards, quiz, review, battle lobby/play/podium, leaderboard, profile, admin readers/reader/lesson/settings/users) at 320, 390 and 1280, in light and dark, saved to `/tmp/shots/`. Check each one. Expected:
  - no text overflow or truncation (Review Focus 1);
  - the last content above the dock (Review Focus 5);
  - centred rail icons;
  - no default-shadcn-looking leftovers.
  
  Fix and re-shoot until clean.
- [ ] **Step 4:** Run `grep -rn "MasteryRing\|StatChips\|suggestions" src server`. Expected: no hits.
- [ ] **Step 5:** Redeploy the demo with `scripts/demo-up.sh --build`, then `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/`. Expected: `200`.
- [ ] **Step 6:** Commit `chore: Speelveld verification fixes`.
