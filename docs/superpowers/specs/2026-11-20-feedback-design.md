# Feedback & issue reports

Date: 2026-11-20. Size: project. Order of jobs: About → **feedback & issues** → speed → whole-reader learning.

## Intent
Students should be able to tell the maker what they think and report problems from wherever they are, with as little effort as possible. The admin collects everything in one inbox and can turn a good report into a public GitHub issue on the open-source repo without leaking who sent it.

## Goals
- Any logged-in user can send a report: **type** (feedback / bug / idea), a **message**, an optional **screenshot**, and **automatic context**.
- Two entry points:
  - a small **floating help button**;
  - a **"Report this problem"** action on error toasts and on a new crash screen, with the error prefilled.
- Admins get an **inbox** (`/admin/feedback`). Each report has a status (new / in progress / done), there are filters by type and status, and a count of new reports is shown in the admin nav.
- **"Send to GitHub"** opens a prefilled `issues/new` page on GitHub (no token). The admin edits the title and body in the app first, then submits on GitHub and can paste the issue link back into the report.

## Non-goals
- No replies to the user and no notifications back to them.
- No reports from logged-out visitors.
- No GitHub API or token.
- No email alerts to admins.
- No automatic screen capture; the user picks an image file.

## Anti-goals (a failure even if it works)
- The help button covers an answer button, a timer or player controls.
- A reporter's name, email or screenshot reaches GitHub without the admin choosing it.
- Screenshots leak location data (EXIF/GPS) or are reachable by anyone other than admins.
- The form becomes a spam or disk-filling vector.

## Approaches (for "Send to GitHub")
- **A. A prefilled `github.com/…/issues/new?title=&body=&labels=` page. Chosen.** There is no token or secret. The admin is always the last check before anything goes public, and the screenshot is dragged in by hand when wanted. The cost: the issue link has to be pasted back by hand (optional).
- B. Creating the issue through the GitHub API with a stored token. Rejected: a token to manage, the API can't attach images, and it is one click from public.

## Decided by the owner
- Logged-in users only.
- The report has a type, a message, a screenshot upload and automatic context. No replies.
- The entry points are the floating help button and error screens/toasts.
- **The help button is hidden during quizzes, flashcards, review sessions, battles and the audio lesson player.**
- GitHub: approach A. Never include the name or email. The admin edits the draft and chooses whether to add the screenshot.

## Design

### Data
New table `feedback`:
- `id`;
- `userId` (FK → user, `ON DELETE SET NULL`, so reports survive account deletion);
- `type` (`feedback` | `bug` | `idea`);
- `message` (text);
- `context` (JSON, see below);
- `screenshot` (nullable file name);
- `status` (`new` | `in_progress` | `done`, default `new`);
- `githubUrl` (nullable);
- `createdAt`, `updatedAt`.

It gets an index on `(status, createdAt)` and a Drizzle migration `0007_feedback.sql`.

Limits go in `shared/limits.ts`:
- message 10–4000 characters;
- screenshot ≤ 5 MB after client-side processing;
- `githubUrl` must start with `https://github.com/`.

### Automatic context (shown to the user before sending: "Dit sturen we mee")
- `path` (the route path, without query string);
- the current reader and lesson code and title when on a lesson or reader page;
- app version (the git short SHA, injected at build as `__APP_VERSION__`; `dev` in development);
- browser and OS (user agent, plus a parsed short label);
- viewport size, locale, theme, and whether the PWA is installed (standalone);
- for error reports: the error message, the HTTP status/code and the failing API path. A stack trace is included only from the crash screen, capped at 4 KB.

There are no cookies, no tokens and no full URLs with query strings.

### Screenshot handling
- On the client, the chosen image (PNG/JPEG/WebP/HEIC that the browser can decode) is drawn to a canvas, scaled to at most 1600 px on its long side, and exported as WebP (falling back to JPEG). This strips EXIF/GPS metadata and caps the size.
- The server accepts multipart `image/webp|jpeg|png`, ≤ 5 MB, checks the magic bytes, and stores it at `UPLOAD_DIR/feedback/<id>.<ext>`.
- It is served only to admins at `GET /api/admin/feedback/:id/screenshot` with `Cache-Control: private, no-store`.
- Deleting a report deletes its file.

### API
- `POST /api/feedback` (logged in, multipart):
  - fields `type`, `message`, `context` (JSON, validated and size-capped at 8 KB) and an optional `screenshot`;
  - rate limits: **5 per hour and 20 per day per user**, using the existing rate-limit helper, and the body cap is applied before parsing;
  - returns `{ id }`.
- `GET /api/admin/feedback?status=&type=` returns a list, newest first, with the reporter's display name and email (admins only).
- `GET /api/admin/feedback/count` returns `{ new: number }`, for the nav badge.
- `PATCH /api/admin/feedback/:id` takes `{ status?, githubUrl? }`.
- `DELETE /api/admin/feedback/:id`.
- `GET /api/admin/feedback/:id/screenshot`.

### Student UI
- **Floating help button.** A round chunky button with a lucide `MessageCircleQuestion` icon, bottom-right. On phones it sits just above the floating dock and clears the safe area; on desktop it sits at the bottom-right corner. It renders only inside `AppLayout` (so never inside `StudyShell`, which covers quiz, cards, review and the battle room) and is also hidden while the lesson view is `?view=listen`. It is never shown logged out.
- **Feedback sheet.** A drawer on phones and a dialog on desktop, with:
  - the type as a segmented control (Feedback · Bug · Idee), defaulting to Feedback, or to Bug when opened from an error;
  - the message with a character counter;
  - "Screenshot toevoegen" (a file picker with a thumbnail preview and a remove button);
  - a collapsible "Dit sturen we mee" list showing the context;
  - a send button.
  After sending, a success toast says "Bedankt! We kijken ernaar." Drafts are kept in memory while the sheet is closed and reopened in the same session.
- **Error entry points.**
  - `notify.error` gets an optional "Melden" action that opens the sheet with type Bug and the error attached. It is wired for API errors that are 5xx or network failures, not validation errors.
  - A new router-level **crash screen** (`errorElement`) shows a friendly message with "Opnieuw laden" and "Probleem melden" (the stack is attached).
- Copy is in nl and en.

### Admin UI
- A new "Feedback" tab in the admin layout with a badge for new reports. The Beheer item in the rail and dock also shows the new count.
- **List:** cards or table rows showing type, status, the start of the message, reporter, time ago and a screenshot indicator. It has filters for status (default: not done) and type.
- **Detail** (a drawer or page):
  - the full message, the context as a readable list, the screenshot (click to enlarge), and the reporter;
  - a status select, a delete action (with confirm), and a GitHub link field;
  - **"Naar GitHub"**: a dialog with an editable title (default: `[type] first line of message`) and body. The default body is markdown with the message, the context table and "Gemeld via de app". It never contains the name or email. There is a label checkbox (`bug`/`enhancement`/`feedback`) and the note "Screenshot? Sleep hem zelf in het GitHub-venster", with a download button for the screenshot. Opening the dialog sets the status to in progress. The URL is built with `URLSearchParams` and the body is truncated so the URL stays under 8000 characters, with a "(ingekort)" note.
- The repo for issues comes from the `GITHUB_REPO` env variable, default `SilkePilon/windesheim-readers`, so self-hosters with a fork point it at their own repo.

## Constraints
- Same stack and patterns as the rest of the app: Hono routes in `server/routes`, zod in `server/lib/input.ts`, Drizzle migrations, TanStack Query, shadcn/ui, Speelveld styling, mobile-first, light and dark themes.
- No new runtime dependencies except possibly a tiny user-agent parser. Prefer a small hand-written parser.
- Never echo user input back in error responses (the existing pattern).

## Testing
- **API:** create (with and without screenshot), validation (type, message length, context size, bad image magic bytes, too large), rate limit 6th/hour → 429, 403 for non-admin on admin routes, screenshot 404 for a missing file, delete removes the file, `githubUrl` validation.
- **Unit:** the GitHub URL builder (no name/email, truncation under 8000, labels) and the context collector (no query string, error fields capped).
- **UI:** the help button's visibility rule as a pure function `showHelpButton(pathname, search)`.

## Retention (decided by the owner)
- When a report has been `done` for 90 days, its screenshot is deleted automatically; the text stays. This runs on server start and once a day, using the existing timer/cron pattern in `server/index.ts` if there is one, otherwise a simple `setInterval`.
- There is a global cap of **500 MB** on `UPLOAD_DIR/feedback`. Above it, new reports are still accepted but **without** the screenshot: the API returns `{ id, screenshotDropped: true }` and the sheet shows a short notice.

## Calls made during review (builder questions settled by the designer)
- **Help button visibility:** the button is shown on the lesson page only when there is no `?view=` (the overview). It is hidden on every lesson activity view (summary, listen, explain, open, tutor) as well as in `StudyShell`. `showHelpButton(pathname, search)` is a pure function with tests.
- **Repo and version on the client:**
  - `GET /api/admin/feedback` includes `{ repo }` (from `GITHUB_REPO`), and the GitHub URL is built on the client by a pure `githubIssueUrl(repo, draft)` in `shared/`.
  - `__APP_VERSION__` comes from the `APP_VERSION` env variable at build time. CI and Docker pass the commit SHA as a build arg. Otherwise it falls back to `git rev-parse --short HEAD`, and then to `dev`.
- **Context schema:** strict zod, with unknown keys stripped and every string capped (path 300, titles 200, error message 500, stack 4 KB, user agent 400).
- **Redaction:** the default GitHub draft replaces email-like strings in the message and the context with `[email]`. The admin can still edit everything.

## Left to the builder
Exact visual layout within the design language; the empty-state copy; the time-ago formatting (reuse `shared/format.ts` if it fits).
