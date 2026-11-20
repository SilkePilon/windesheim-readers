# Speed: first load, phone smoothness, server and caching

Date: 2026-11-20. Size: project. Order of jobs: About → feedback → **speed** → whole-reader learning.

## Intent
The app should open fast on a phone and scroll smoothly on home. The server should stay quick as readers and users grow. Nothing the student sees changes, except that it is faster.

## Measured baseline (2026-11-20, v1.0.0)
- **First load JS**: entry `index-*.js` 906 KB raw. With its modulepreloads, about **1.3 MB raw / ~410 KB brotli**; the live site is brotli-compressed by the proxy.
  - The entry chunk holds every student page (lesson, quiz, cards, review, battle, leaderboard, profile).
  - It holds the AI tutor chat: `ai`, `@ai-sdk/*` and their `zod`, about 165 KB.
  - It holds the markdown stack (`react-markdown`, micromark, mdast, hast), about 120 KB.
  - The `queries` chunk ships **both** locales (nl 29.5 KB + en 28.4 KB).
- **Home world map** (40 lessons, 8 weeks): a 680 KB HTML string, about 10,400 SVG elements and 35 ms to build in Bun.
  - The layers span the full world height (about 10,300 world units): ground, segments, a grain layer with a live `feTurbulence` filter pattern, a `multiply` dusk layer (dark mode only) and a `screen` lights layer.
  - Dark mode also puts `filter: saturate()` on the whole art layer.
  - Animations are already paused off-screen.
- **Server** (dev DB is tiny, every query under 0.1 ms, so the issues are about growth and write cost):
  - pragmas: only `journal_mode=WAL` and `foreign_keys=ON`, so `synchronous` is FULL and every write fsyncs;
  - `GET /review/queue` reads every lesson and all of the user's `card_review` rows;
  - `cardMasteryByLesson` scans every flashcard in every reader on each `/readers` and lesson call;
  - the leaderboard has no index on `user_stats.xp` or `xp_event.created_at`;
  - `/readers` filters lessons and progress in nested loops.
- **Caching**:
  - Hashed `/assets/*` get no Cache-Control from the app; the proxy sends `max-age=14400`.
  - The app itself never compresses, so self-hosters without a proxy send everything raw.

## Goals
1. **Smaller first load.** The entry plus modulepreloaded JS drops by at least 35% (raw, measured by a script). Home and login still render without an extra round trip on a cold load.
2. **Smooth home on phones.** The work the browser does to paint and composite the world map drops a lot, measured before and after. The art looks the same.
3. **Server growth-proof.** The review queue and the mastery queries only read the user's and the needed lessons' rows. The leaderboard still ranks everyone, but through indexes instead of a sort over all rows. Writes stop forcing an fsync per statement.
4. **Caching and compression.** Hashed assets are cached for a year as immutable. The app compresses JSON and text itself and serves pre-compressed static files.
5. A **bundle budget check** that runs in CI, so the first load can't silently grow back.

## Non-goals
- No redesign of the world art and no change to which decorations exist (see "phone density" below for the one exception).
- No change to the API response shapes.
- No server-side rendering.
- No new database engine and no caching layer (Redis or similar).

## Anti-goals (a failure even if it works)
- A route shows a blank screen or a spinner flash for more than a moment on a warm (PWA-precached) navigation.
- Offline use breaks: every lazy chunk must still be precached by the service worker.
- The tutor chat stream gets buffered by compression, so replies stop appearing token by token.
- Audio range requests break.
- An admin who was demoted keeps admin access.

## Design

### 1. First load (client)
- **Route splitting.** `LessonPage`, `LessonStudyPage`, `ReviewPage`, `LeaderboardPage`, `ProfilePage` and `BattlePage` become `lazy()` imports, like the admin pages. `HomePage` and `LoginPage` stay in the entry, because one of them is always the first screen.
  - A `Suspense` boundary sits inside `AppLayout`'s outlet (so the rail and dock stay put while a page loads) and around the study-shell routes. The fallback is the existing `PageSpinner`.
  - **Warm-up:** after home has rendered and the browser is idle (`requestIdleCallback`, falling back to `setTimeout` 2 s), import the student page chunks in the background, so the first tap is instant even before the service worker has them cached. Skip this when `navigator.connection.saveData` is true.
- **Tutor.** `TutorTab` is lazy-loaded inside the lesson page, only when the tutor tab is opened. That keeps `ai`, `@ai-sdk/react` and `zod` out of both the entry and the lesson chunk.
- **Markdown** stays a normal import. It is only used by the lesson Read view, the tutor and the admin lesson page, so route splitting already takes it out of the entry.
- **Locales.** `nl` stays bundled (it is the primary language and the fallback). `en` is loaded with a dynamic import:
  - before the first render when the initial language is `en` (`main.tsx` awaits `ensureLocale(initial)` before `createRoot().render`);
  - inside `setLocale("en")` before `changeLanguage`.
  - The English chunk is precached by the service worker like every other chunk.
- **Budget script** `scripts/bundle-budget.ts`: after `vite build`, it reads `dist/index.html`, sums the raw and gzip size of the entry script plus every `modulepreload` JS, prints a table and exits non-zero above the budget. The budget is set to the measured result after this job plus 10%. CI runs it after the build step.

### 2. World map on phones
Measure first. The plan's first world task adds a measurement routine and records a baseline in the light and dark themes:
- the existing `world:build` / `world:painted` marks;
- a scripted scroll through home with frame timings from `requestAnimationFrame` deltas (count of frames over 20 ms);
- the number of SVG elements in the DOM.

It is run in the T3 preview browser at 390 px width. Then it applies these changes in order, re-measuring after each, and keeps a change only if it helps or is neutral:
1. **Grain as a static tile.** Replace the full-height `feTurbulence` filter pattern with a small pre-rendered noise tile: a 160×160 PNG data URI generated once at build time or committed, or a CSS `background-image` on `.world-art::after`, at the same opacity. Live turbulence filters are re-rasterised by the browser and are expensive on phone GPUs.
2. **Off-screen segments not painted.** The existing IntersectionObserver also toggles `visibility: hidden` on segment `<svg>` layers that are well outside the viewport, with a large root margin (for example 1 screen) so nothing pops in. It observes the `.world-seg` svg elements rather than the inner `g`. Paused animations stay paused.
3. **Dark-mode filter.** Theme stays pure CSS, and the world is never rebuilt on a theme toggle. The dark-mode `saturate()` filter on the whole art layer is the one candidate here: it is replaced by pre-saturated dusk colours only if a screenshot comparison shows no visible difference. Otherwise it stays.
4. **Phone density (only if 1–3 are not enough).** Below 520 px width, drop the smallest purely decorative props (`kit` scatter items such as grass tufts, pebbles and flowers) at a fixed rate. The decision is deterministic per seed, so the world looks the same on each visit. Set pieces, the road, lights and anything tied to a lesson are never dropped.

Each change gets the same visual check: a screenshot at 390 px in both themes, compared with the baseline.

### 3. Server and database
- **Pragmas** in `server/db/index.ts`: `synchronous = NORMAL` (safe with WAL: there is no corruption risk, and at worst the last commit is lost after a power cut), `busy_timeout = 5000`, `cache_size = -20000` (about 20 MB), `temp_store = MEMORY`. No `mmap_size` (container memory accounting).
- **Review queue**: the due and fresh queries return `lesson.code` through a join, so there's no read of every lesson. Rating previews only read the `card_review` rows for the queued flashcard ids (`inArray`).
- **`cardMasteryByLesson(userId, scope?)`**: it is scoped to the lessons the caller needs. For `/readers` the scope is a subquery (no huge `IN` list for admins); for the lesson page it is the one lesson id. The results stay identical.
- **Indexes** (declared in `schema.ts`, migration generated with `bun run db:generate`): `user_stats(xp)`, plus `xp_event(created_at, user_id)` for the weekly leaderboard. Before adding them, check the query plans (`EXPLAIN QUERY PLAN`) to confirm the index is used.
- **`/readers` grouping**: pre-group lessons by reader and progress by lesson in `Map`s. The output stays the same.
- **Tests**: the existing API tests must pass unchanged. Add a test showing the review queue returns the same items and intervals as before for a seeded user with reviews across two lessons. Add a test that `cardMasteryByLesson` gives the same result with and without scoping.

### 4. Caching and compression
- A **successful** static hit under `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`. A missing `/assets/*` file returns **404**, not the SPA shell, so a year-cached HTML response can never stand in for a script. Fonts and hashed images live under `/assets` too. The shell, `sw.js` and the manifest stay `no-cache`, as now.
- **Pre-compressed static files**: a small Vite plugin (`closeBundle`, placed after `VitePWA`, using `node:zlib`, no new dependency) writes `.br` and `.gz` copies of JS, CSS, SVG, JSON and webmanifest files over 1 KB in `dist/`. Because it's a plugin, Docker and CI (`bunx vite build`) get the copies too. `serveStatic` uses `precompressed: true`. `index.html` is served by `spaShell`, not by `serveStatic`, so it isn't pre-compressed.
- **Dynamic compression**: `hono/compress` (gzip) on `/api/*` and on the SPA shell, for JSON and HTML. It is controlled by an env variable `HTTP_COMPRESS`, which defaults to on. Production sits behind Cloudflare, which already brotli-compresses, so the homelab deployment sets `HTTP_COMPRESS=false`; otherwise a gzip response from the origin would replace Cloudflare's smaller brotli. It is not applied to:
  - `text/event-stream` (the tutor stream; Hono's matcher skips it already — a test asserts this);
  - audio or other binary responses;
  - responses that already have `Content-Encoding`.
- The static and cache wiring moves into a function `mountStatic(app, root)`, so tests can run it against a temporary fixture folder (CI runs `bun test` before `vite build`, and `env.isProd` is fixed at import).
- **Tests**: `/assets/x.js` gets the immutable header; a missing `/assets/nope.js` returns 404; `index.html` stays `no-cache`; a JSON API response with `Accept-Encoding: gzip` comes back gzipped; the chat stream route is not compressed; an audio Range request still returns 206 with the right bytes.

### 5. After a deploy
More lazy chunks mean a visitor without a service worker on an old page can request chunks that no longer exist. On `vite:preloadError`, the app reloads once (guarded in `sessionStorage` so it can't loop).

## Calls made during review (builder questions settled by the designer)
- **Suspense:** React Router runs navigation inside a transition and a view transition. On a cold chunk load the old page stays on screen until the chunk arrives, instead of showing a spinner. This is accepted, because the idle warm-up and the service worker precache make cold loads rare. Battle's fallback sits in the study group, so the dock briefly disappears; also accepted.
- **Warm-up** extends the existing idle `preloadWorld` in `app-layout.tsx` instead of adding a second one. `navigator.connection` needs a cast.
- **`setLocale`** keeps its synchronous signature for its callers: it loads the English bundle (`addResourceBundle`), then calls `changeLanguage`. `main.tsx` waits for `ensureLocale(initial)` before rendering, without a top-level await.
- **World tests** (`tests/world-render.test.ts`) are updated alongside any change to the grain or lights layers.
- `busy_timeout` applies only to the server's connection; the e2e scripts are left alone.

## Rejected
- **better-auth `cookieCache`**: it saves two sub-millisecond queries per request, but a demoted admin or a deleted user would stay valid until the cookie expires (an anti-goal).
- **One transaction per review answer**: `award()` is async, and drizzle's bun-sqlite transactions are synchronous, so an async callback commits early. Doing it would mean rewriting the award path as synchronous. With `synchronous=NORMAL`, each commit no longer fsyncs, which removes most of the gain.
- **Raising the default `staleTime`**: it saves refetches, but risks stale XP or progress where a mutation doesn't invalidate. That's not worth it without an audit, so it's out of scope.
- **Badge counters in `user_stats`**: low impact now; it would need a data backfill.

## Release
After merge, this work ships as v1.1.0, together with the maker-photo fix already on main, using the same deploy flow as v1.0.0 (tag → CI image → homelab `deployment.yaml` digest → Argo CD).

## Left to the builder
- The exact Suspense placement within the layouts.
- The noise tile generation method.
- The budget number, once it is measured.
