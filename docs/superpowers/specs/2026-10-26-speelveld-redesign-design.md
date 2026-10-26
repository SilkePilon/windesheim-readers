# Speelveld redesign + AI settings rework

Date: 2026-10-26
Status: ready for owner review

## Intent

Windesheim Readers works, but it looks like a default shadcn dashboard: a sidebar on
desktop, a fixed tab bar on mobile and tabbed pages. The owner wants students to *want*
to open it every day. That means a full visual redesign around a game-like identity
called **Speelveld**: a lesson path you walk up, chunky tactile buttons, levels,
quests and a floating dock.

The second part fixes the AI settings, which are currently unusable:
- testing an API key fails;
- the model lists are hard-coded and will go stale.

Mockups (screenshots verified) live in `.superpowers/mockups/` (git-ignored):
- `directions.html`: the three directions; B was chosen.
- `cards-v3.html`: flashcard ratings and the lesson page with the level bar.
- `dark.html`: dark mode.
- `path-v2.html`: the upward path.
- `student-pages.html`: leaderboard, battle, profile and login.
- `admin-pages.html`: the calm admin pages.

## Goals

- Every page redesigned in the Speelveld style, in both light and dark mode.
- Mobile-first. On mobile the navigation is a floating dock; on desktop it's a floating
  icon rail on the left. There's no sidebar and no edge-attached tab bar.
- Studying feels like a game:
  - a lesson path;
  - levels per lesson;
  - daily quests;
  - full-screen study sessions with Duolingo-style feedback.
- Admins can validate a key and pick a model from a live list fetched from the provider.
- The app stays on the latest AI SDK. It already is: `ai` 7.0.153 and the `@ai-sdk/*` 4.x
  packages are all the npm `latest`. Keep it that way: bump to whatever is `latest` at
  build time.

## Non-goals

- No changes to the learning engine:
  - FSRS scheduling;
  - XP amounts;
  - the mastery formula;
  - streak rules;
  - quiz anti-cheat.
- No new study activities beyond what exists. Quests are the only new feature system.
- No changes to auth, email, or the AI content-generation prompts.

## Anti-goals (would make it a failure even if it "works")

- Lessons gated or locked. Every published lesson must stay open in any order, because
  students follow their timetable, not the path.
- Admin pages that are as bouncy as the student pages and slow to edit in.
- Mockup-quality UI shipped without checking. Every page must be screenshot-checked at
  phone width (390px) and desktop width (1280px), in both themes.
- Text that overflows or gets truncated in buttons. The first flashcard mockup did this,
  and the owner called it out.

## Constraints

- Keep **shadcn/ui** (owner's explicit choice). Restyle through theme tokens and
  variants. Don't swap in a different component kit.
- The existing stack stays: React 19 + Vite, Tailwind v4, Hono on Bun, SQLite/Drizzle,
  better-auth.
- Dutch + English. Every new string goes in `src/locales/nl.ts` and `en.ts`.
- The demo runs from this repo via `scripts/demo-up.sh --build`. The redesign must keep
  `bun run build` and `bun run typecheck` green.

## Approaches considered

1. **Restyle shadcn in place (chosen).**
   - New tokens and fonts, plus `chunky` and `flat` variants on Button and Card.
   - New layout and game components, then every page rebuilt on top of them.
   - Data logic stays.
   - Trade-off: shadcn's defaults have to be overridden carefully per component.
2. **A custom component kit without shadcn.**
   - Gives total visual freedom.
   - Rejected: the owner asked for shadcn, and it means rewriting working forms, dialogs
     and menus.
3. **An existing gamified template or registry.**
   - Faster at the start.
   - Rejected: we'd inherit someone else's look and fight it for the path and dock.

The owner picked 1.

## Decisions made with the owner

### Visual system (Speelveld)

| Token | Light | Dark |
|---|---|---|
| background | `#F1ECFF` lilac | `#1B1536` deep grape (not black) |
| surface/card | `#FFFFFF` | `#2A2152` |
| chunky shadow | `#D9CEFF` | `#110C24` |
| text | `#241A4A` | `#F1ECFF` |
| muted text | `#8C82B5` | `#A79CD6` |
| primary (grape) | `#6B3CF6`, shadow `#4A22C4` | `#8C66FF`, shadow `#5B37D6` |
| success (mint) | `#19C59B`, shadow `#0E9474` | `#2DD4A7`, shadow `#159C7A` |
| warning (orange) | `#FF8A1F` / rating "Lastig" `#FFA41B` | `#FF9F2E` |
| danger (pink) | `#FF5C8A`, shadow `#D63A68` | same |
| info (blue) | `#3E8BFF`, shadow `#2066D6` | same |
| gold | `#FFC83D`, shadow `#E0A100` | same |
| track (empty bar) | `#E2DAFF` | `#3A2F6B` |

- **Type:** Fredoka (600/700) for headings, lesson codes, buttons and numbers. Nunito
  (600/700/800) for body text. Load both via `@fontsource-variable` or `@fontsource`;
  don't use the Google Fonts CDN, since the app is self-hosted.
- **Chunky:** a solid offset shadow with no blur, `box-shadow: 0 4–6px 0 <shade>`. On
  press, translate down by the shadow height and drop the shadow. Big radii: 16–26px
  on cards, 14–18px on buttons.
- Lesson codes (`1.2A`) are always set in Fredoka in the primary colour. They're the
  most recognisable thing in the product.

### Navigation

- **Mobile (< md):** a floating dock, inset 16px from the screen edges and the bottom
  (plus the safe-area inset).
  - It's white (or surface) with a chunky shadow.
  - Five icons: Pad (home), Herhalen (review, with a due-count badge), Battle, Ranglijst
    and Profiel. Admins get a sixth icon, Beheer (shield).
  - The active item expands into a purple pill with its label.
  - The **dock hides in full-screen study mode**.
- **Desktop (≥ md):** a floating vertical icon rail on the left, vertically centred and
  not attached to the edge.
  - It holds the same items, with the yellow "wr" logo on top. The admin item sits below
    a divider.
  - **Every rail item is a fixed square (for example 44×44) with its icon centred.** The
    logo uses the same width. The owner spotted off-centre icons in the mockup because
    the logo pill was wider than the icons.
- The "Leren" (learn) overview is folded into the home path. A reader switcher appears
  on home when there's more than one published reader. The `/learn` route can redirect
  to `/`.

### Home = the lesson path

- A top row of chunky chips: streak (flame), level and XP. Under that, the daily-goal
  bar.
- The **path climbs upwards**: finished lessons are at the bottom and upcoming ones
  above. On load the view scrolls to the current lesson.
  - Nodes zig-zag left and right.
  - Node states:
    - done (mint): mastery ≥ 80%;
    - current (purple with a ring, plus a "Ga verder" bubble): the most recently
      studied, not-done lesson, or else the first lesson that hasn't been started;
    - started;
    - not started (surface colour).
  - A mini 5-segment level bar sits under each node.
- **All lessons are open**, and tapping any node opens that lesson.
- Group dividers use the `week` field ("Week 2"). Lessons have no chapter title in the
  schema, so the mockup's "Hoofdstuk 2: Gespreksvoering" becomes "Week 2". This is my
  call.
- **Desktop:** the path sits in the centre. The right column holds the daily goal,
  today's quests and the top of this week's leaderboard with your own row.

### Lesson page

- Header card: the code (large), the title and a **level bar**.
  - The bar has 5 chunky segments: `level = floor(mastery × 5)`, shown as "Niveau n van 5".
  - A line under it names the most valuable next step, for example "Leer nog 7 kaarten
    voor niveau 3". It's derived from the existing mastery components: quiz 0.4,
    cards 0.3, explain 0.2, read 0.1.
- It **replaces the % ring** everywhere.
- **Activity tiles replace the tabs:** Kaarten, Lezen (summary), Quiz, Leg uit, Open
  vragen, Tutor. Each tile has a coloured icon square and a status line.
  - The recommended next activity is filled purple.
  - Lezen opens the summary, key points and terms as a reading view.
- Desktop: the summary and key points sit on the left, with the "start next step"
  button and the other tiles on the right.

### Full-screen study mode

Flashcards, quiz, review and battle play run full screen:
- an ✕ to close, a chunky progress bar and a counter;
- no dock or rail.

**Flashcards:**
- The card shows the lesson code tag, the term and, once flipped, the answer.
- After flipping, a **2×2 grid of rating tiles** sits at thumb height:
  - Opnieuw (pink), Lastig (orange), Goed (mint), Makkelijk (blue).
  - Each has an icon, its label and **the next-due interval** (for example "2 dagen"),
    which comes from FSRS `repeat()` previews.
- Swipe right = Goed, swipe left = Opnieuw.
- Keys 1–4 keep working.
- Labels must never truncate at 320px width.

**Quiz:**
- Big answer blocks with chunky shadows.
- Feedback is a **bottom sheet**: mint for correct, pink for wrong. It holds the
  explanation and a full-width "Volgende" button.
- A combo counter ("3x") sits in the top bar.

### Other student pages

- **Leaderboard:**
  - a podium for the top 3 (gold, silver, bronze steps);
  - then a list with your own row outlined in purple;
  - a chunky segmented toggle for week and all time;
  - the "resets Monday" note and the hidden-from-leaderboard note are kept as small text.
- **Battle:**
  - Its own dark stage (`#2A1C6B`) for lobby, play and podium.
  - During play: a countdown ring, the question, an "x of y answered" line, and four
    large Kahoot-style answer blocks with shapes (triangle, diamond, circle, square) in
    pink, blue, gold and mint.
  - The host screen and lobby code get the same treatment.
- **Profile:**
  - an avatar with initials, the name and level title;
  - 3 stat tiles: total XP, streak and longest streak;
  - a badge grid with colourful tiles, unearned ones greyed out, and the name and
    description on tap;
  - a settings card: nickname, leaderboard visibility, language, theme
    (light/dark/system) and sign out.
- **Login:**
  - a stacked-cards logo showing "1.2A";
  - the app name and tagline;
  - one email field and one chunky button;
  - the sent and error states use the same layout.

### Admin pages (calm variant)

- Same tokens and fonts, but `flat` surfaces: 1px borders, no chunky shadows, denser
  type at 13–14px. Only the primary action button stays chunky.
- Admin home has segmented tabs: Readers, AI-instellingen and Gebruikers.
- **Readers:**
  - A card grid. Each card has a status pill (Gepubliceerd / Content genereren with a
    progress bar "7 van 12 lessen klaar" / Indeling controleren / Fout), the title, the
    course and its counts.
  - **Dragging a PDF onto the page** opens the upload dialog prefilled.
  - Failed readers show **"Opnieuw proberen"**. **A retry never deletes existing
    lessons** (my call, following the reason the owner chose explicit save). Status
    mapping:
    - `error` and the reader has **no lessons**: retry re-runs extraction and structuring
      from the stored PDF. This needs a new endpoint, because today's `restructure` does
      structuring only.
    - `error` but lessons exist (a restructure failed): the pill reads "Fout". Retry
      re-runs generation for lessons in `error` or `pending`. The explicit "AI-indeling
      opnieuw" (with its confirm) is the only way to replace lessons.
    - `ready` with a `reader.error` (interrupted, or some lessons failed): the pill reads
      **"Deels mislukt"** (orange). Retry regenerates only the failed or pending lessons.
- **Reader structure:**
  - An editable table: code, title, week, pages and content status.
  - Click a cell to edit it inline, and **drag the row handle to reorder**.
  - **Explicit save:** when there are unsaved changes, a bar slides up from the bottom
    with "Opslaan" and "Ongedaan maken". This was chosen over autosave because deleting a
    row deletes that lesson's generated content.
  - The generate buttons stay disabled while there are unsaved changes, as they are now.
- **Lesson content editor:** same flat panels. Inline editing of the summary, key
  points, terms, flashcards and questions, as now.
- **Users:** a table with an avatar, name/email, XP, joined date and a role toggle.
  Env-list admins show a locked "Admin via ADMIN_EMAILS" pill.

### Daily quests (new feature)

- **Three quests per user per day** (Europe/Amsterdam day). They're picked
  deterministically from a pool by seeding with user id + day key, so no cron job is
  needed. They're shown on home (in the desktop right column, and in a card above the
  path on mobile) with progress, and they reward bonus XP.
- Owner-approved concept. The quest pool, targets and rewards below are my call:

| Quest | Target | Reward |
|---|---|---|
| Herhaal N kaarten | 20 | 15 XP |
| Haal ≥80% op een quiz | 1 | 15 XP |
| Leg een begrip uit (score ≥ 60) | 1 | 15 XP |
| Verdien N XP | 60 | 10 XP |
| Rond een open vraag af | 1 | 10 XP |
| Oefen 2 verschillende lessen | 2 | 10 XP |

- **Storage:** a new `quest_progress` table (`userId`, `dayKey`, `questId`, `progress`,
  `completedAt`), updated from the same places that call `awardXp`.
- Completing a quest calls `awardXp` with a new reason, `quest`, and shows a celebration
  toast.
- Quest XP is **not** subject to the quiz diminishing-returns rule.
- **Quest XP counts everywhere** (owner's decision):
  - level and total;
  - weekly and all-time leaderboard;
  - the daily goal.
  
  The one exception is the "Verdien N XP" quest itself, which ignores `quest` XP so
  that quests can't complete each other. No reason filters are needed in the
  leaderboard or in `xpSince`.

## AI settings rework

### Findings

- **SDK version:** already the newest (`ai@7.0.153`, `@ai-sdk/google@4.0.105`,
  `@ai-sdk/anthropic@4.0.88`, `@ai-sdk/openai@4.0.102`, `@ai-sdk/react@4.0.157`,
  `@openrouter/ai-sdk-provider@3.1.0`). There's nothing to migrate. The task is to
  re-check `npm view <pkg> version` at build time and bump if newer.
- **Why key validation is "broken":**
  - The settings page's **Test** button posts only `{provider, model}`. It never sends
    the key typed into the field.
  - The server then falls back to the *saved* key. Nothing was saved (the `setting` table
    is empty on the demo), so every test fails with `No API key configured for provider
    "google"`.
  - The same missing key also made the first reader upload fail at the structuring step
    (seen in `data/demo.log`).
- **Model discovery:** the AI SDK has no model-listing API for direct providers. Only
  `@ai-sdk/gateway` has `getAvailableModels()`, and we don't use the gateway. Every
  provider exposes its own list endpoint:

| Provider | Endpoint | Auth | Useful fields / filter |
|---|---|---|---|
| Google Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000` (page with `pageToken`) | header `x-goog-api-key: <key>` (or `?key=`) | `name` (strip `models/`), `displayName`, `inputTokenLimit`, `outputTokenLimit`. Keep models whose `supportedGenerationMethods` contains `generateContent`. Drop embedding/imagen/aqa/tts. |
| Anthropic | `GET https://api.anthropic.com/v1/models?limit=1000` (page with `after_id` / `has_more`) | `x-api-key: <key>`, `anthropic-version: 2023-06-01` | `id`, `display_name`, `created_at`, `max_input_tokens`, `max_tokens`, `capabilities.structured_outputs`, `lifecycle` (hide `retired`, mark `deprecated`) |
| OpenAI | `GET https://api.openai.com/v1/models` | `Authorization: Bearer <key>` | Only `id`, `created`, `owned_by`, with no capability data. Keep chat-capable families by id (`gpt-*`, `o*`, `chatgpt-*`). Drop `*embedding*`, `*tts*`, `*whisper*`, `*transcribe*`, `*audio*`, `*realtime*`, `*image*`, `dall-e*`, `*moderation*`, `*search*`, `babbage*`, `davinci*`. |
| OpenRouter | `GET https://openrouter.ai/api/v1/models` (public, no key needed) | none | `id`, `name`, `context_length`, `pricing.prompt/completion`, `supported_parameters` (keep those with `structured_outputs` or `response_format` for the generation role), `architecture.output_modalities` includes `text` |
| OpenRouter key check | `GET https://openrouter.ai/api/v1/key` | `Authorization: Bearer <key>` | `data.limit_remaining`, `usage`. A 401 means the key is invalid. |

### Design

- New server module `server/ai/models.ts`:
  - `listModels(provider, apiKey)` returns
    `{ id, name, contextWindow?, maxOutput?, created?, deprecated?, structuredOutput? }[]`,
    sorted newest first.
  - It uses plain `fetch` with a 10s timeout.
  - Results are cached in memory per provider + key hash for 1 hour. "Vernieuwen"
    (refresh) bypasses the cache.
- **Key validation = list call.**
  - A successful list call means the key is valid.
  - A 401 or 403 means the key is invalid; other errors are shown verbatim.
  - OpenRouter's model list is public, so its key is validated with `/api/v1/key`.
  - This costs no tokens. It replaces the token-spending generate call as the
    *key* check.
- **Endpoints:**
  - `POST /admin/settings/ai/validate {provider, apiKey?}`: uses the typed key if given,
    otherwise the stored or env key. Returns `{ok, modelCount | error}`.
  - `POST /admin/settings/ai/models {provider, apiKey?, refresh?}`: same key resolution.
    Returns the model list.
  - `POST /admin/settings/ai/test {provider, model, apiKey?}`: keeps the real "Reply
    with OK" generation to prove the *model* works. **The client must now send the typed
    key.**
- **Settings UI (calm admin style):**
  - Per provider, a key row with a status pill: Ingesteld / Via .env / Niet ingesteld /
    **Ongeldig**.
  - Pasting a key validates it immediately (debounced), and the pill shows the result.
    Saving a key that fails validation asks for confirmation.
  - Each role card (Content maken / Tutor & nakijken) has:
    - a provider select;
    - a **searchable model combobox** (shadcn Command) filled from the live list, showing
      the name, id and context size, with deprecated models marked;
    - a "Vernieuwen" button;
    - free-text entry of a model id as a fallback.
  - The generation role warns if the chosen model doesn't advertise structured-output
    support. This only applies where the provider exposes that (Anthropic, OpenRouter).
- Remove `MODEL_SUGGESTIONS`. Keep a single default model id per provider, used only
  when nothing is configured, so first-run setup has a sane preselection.

## Left to the builder

- Component file structure, and the names of the new shadcn variants and components.
- Exact spacing and type scale, within the tokens above.
- Motion:
  - press-down on chunky elements;
  - the dock pill sliding between items;
  - a card-flip and swipe throw;
  - the feedback sheet slide-up;
  - one celebratory moment for level-up or quest completion.
  
  Respect `prefers-reduced-motion`.
- How the "next step" sentence is chosen when components tie.
- Empty states (no readers, no due cards, no quests left) in the same style.
- The Tutor chat restyle (same tokens; bubbles use surface and primary).
- Whether to use a drag-and-drop library (for example `@dnd-kit`) for reordering, or
  native HTML drag.

## Verification

- `bun run typecheck` and `bun run build` pass.
- The screenshot helper (`~/.local/shot/shot.sh <file> <out.png> <width>`, with the
  local Chromium libs) is used against the running app. Every page at 390px and 1280px,
  in light and dark mode, with no overflow or clipped text.
- The existing API and WebSocket test scripts in `/tmp/wr-tools` still pass. Quiz
  anti-cheat, FSRS and battle behaviour are unchanged.
- AI settings:
  - an invalid key shows "Ongeldig";
  - a valid key fills the model list;
  - Test works with an unsaved typed key.
  
  This is checked with a real key once the owner provides one, and with a bogus key for
  the failure paths.

## Addendum (2026-10-26, owner requests during the build)

### Brand assets
The owner supplied logos. They are committed in `public/brand/`:
- `logo.svg`: colour, four chunky tiles with battle shapes;
- `logo-mono-{navy,purple,white}.svg`;
- `app-icon.svg` and `app-icon-purple.svg`;
- `favicon.svg`/`favicon.ico`;
- rasterized `logo-email.png` (192px), `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`;
- `manifest.webmanifest`.

They replace the yellow "wr" tile and the stacked-cards login logo.

| Where | Asset |
|---|---|
| Rail and dock logo | `logo.svg` |
| Login | `logo.svg`, large |
| Battle stage | `logo-mono-white.svg` |
| Admin header (optional) | `logo-mono-navy.svg` (light) and `logo-mono-white.svg` (dark) |
| Email | `logo-email.png` |

### Magic-link email redesign
The owner asked for a much better-looking email in the new theme, with the logo, following
email best practices.

- **Built with React Email** (`@react-email/components`, rendered server-side with
  `@react-email/render`). This gives table-based, inline-styled, client-tested markup.
  Send both `html` and a `text` (plain-text) part.
- **Logo as an inline CID attachment.** The PNG goes through Resend's `attachments` with a
  `contentId`, and is referenced as `cid:logo`.
  - Remote images aren't an option, because the app is tailnet-only and Gmail's image
    proxy can't reach it.
  - SVG in email is unreliable.
  - It gets alt text "Windesheim Readers".
- **Layout:**
  - a single column, max 600px;
  - a lilac page background `#F1ECFF`;
  - a white card (`#FFFFFF`; near-white is acceptable) with radius 24px and a "chunky"
    bottom border `6px solid #D9CEFF`. Use a border, not a box-shadow, because shadows
    aren't supported in email;
  - the logo (64px) centred at the top of the card;
  - a Fredoka-style heading. The font stack is
    `'Fredoka','Nunito','Segoe UI',Roboto,Helvetica,Arial,sans-serif`. Web fonts are
    optional, so no CDN is required;
  - a short body;
  - a **bulletproof chunky button**: `#6B3CF6` background, white text, 16px/600,
    padding 14px 28px, radius 14px, `border-bottom: 4px solid #4A22C4`, with Outlook MSO
    padding handled (React Email `Button`), and a tap target of at least 44px;
  - below the button, the raw link as fallback text, break-all, muted;
  - a footer: "Werkt maar één keer en verloopt na 15 minuten" plus "Niet aangevraagd? Negeer
    deze e-mail; er gebeurt niets.", and the app name.
- **Preheader:** "Je inloglink voor Windesheim Readers, 15 minuten geldig" (en: "Your
  sign-in link for Windesheim Readers, valid for 15 minutes").
- **Subject:**
  - nl "Je inloglink voor Windesheim Readers"
  - en "Your Windesheim Readers sign-in link"
- **Language:** use the stored `user.locale` for an existing user with that email,
  otherwise `nl`. Only one language per email; the old bilingual text is removed.
- **Dark mode:**
  - `<meta name="color-scheme" content="light dark">` and `supported-color-schemes`;
  - a `@media (prefers-color-scheme: dark)` block for the clients that honour it (Apple
    Mail): page `#1B1536`, card `#2A2152`, text `#F1ECFF`, card border `#110C24`;
  - avoid pure `#FFFFFF` and `#000000` for text, so forced inversion stays readable;
  - the logo PNG has a transparent background and works on both.
- **No tracking pixels and no click tracking.** Disable it in Resend if it's on.
- **Dev fallback stays:** without `RESEND_API_KEY`, log the link to the console. The e2e
  and dev scripts depend on the `[magic-link] <email>\n  <url>` log format, and it must not
  change.
- **Preview:** a script `scripts/email-preview.ts` writes `/tmp/email-preview-{nl,en}.html`
  (with `cid:logo` swapped for a data URI) so it can be screenshot-checked at 390 and 600px
  in light and dark.
