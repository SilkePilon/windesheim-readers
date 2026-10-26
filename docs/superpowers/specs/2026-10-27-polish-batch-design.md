# Polish batch: themed notifications, motion, ~50 badges

Date: 2026-10-27. Status: requested by owner, details are controller calls (listed at the end).

## 1. Themed notifications (toasts)
Owner: "restyle notifications to match the new theme; their icons are the old ones."
Today: sonner default look (popover bg, small lucide icons) and celebrations with emoji icons (🚀 ✨ 🎯 + badge emoji).

- One `<AppToast>` rendering via `toast.custom` (or sonner `unstyled` + classNames), reused by a small API `notify.success|error|warning|info(title, {description, action})` that replaces direct `toast.*` calls across the app.
- **Look = Notice component**: card bg, 20px radius, chunky bottom shadow (`--chunky`), 40px rounded icon tile in the tone colour (success mint/Check, danger pink/AlertTriangle-or-CircleAlert, warning orange/TriangleAlert, info blue/Info) with dark text on fills per the contrast rules; Fredoka title, Nunito description; optional action button; close on swipe/tap.
- **Celebrations** (`src/lib/celebrate.ts`) get dedicated designs, no emoji:
  - XP gain: compact gold pill "+15 XP" with a Sparkles icon, 1.5 s.
  - Level up: large primary card, big Fredoka "Level 5!" + level title, Rocket/ChevronsUp icon tile in gold, 4 s.
  - Quest done: mint card, Target icon tile, quest name + "+15 XP".
  - New badge: the badge's own icon tile (same component as profile, see §3), "Nieuwe badge: Boswachter" + description.
- **Position**: top-center on mobile (dock is at the bottom), bottom-right on ≥ md. Max 3 visible, stacked.
- Motion: slide/fade in 200 ms with a slight overshoot; instant under reduced motion. `role="status"` (success/info) / `role="alert"` (error/warning) via sonner props.

## 2. Motion (small, smooth)
Owner: "small but smooth animations between pages and elements like the battle questions, pages etc."
Rules: 150–300 ms, ease `cubic-bezier(.2,.8,.2,1)`, transform/opacity only, never on hover/scroll for layout, everything instant under `prefers-reduced-motion`. No heavy animation library: CSS + View Transitions API (+ `tw-animate-css` already present).

- **Page transitions**: View Transitions (`document.startViewTransition`) via react-router's `viewTransition` on navigation (Links/navigate in dock, rail, tiles, back buttons). Default: content fades + slides 12 px (forward = from right, back = from left; detect via navigation type/history index). Dock, rail and top chips get `view-transition-name`s so they stay put. Graceful no-op where unsupported.
- **Battle**: question enters (slide-up 16 px + fade), answer blocks pop in staggered 40 ms; on reveal the correct block does a small bounce/scale and wrong ones fade to 50 %; points count up (tween ≤ 600 ms); podium steps rise in sequence; countdown number already pops.
- **Quiz**: next question slides in from the right (previous out to the left); feedback sheet already slides.
- **Flashcards**: after rating/swipe the next card slides/fades in (current flip/swipe kept).
- **Lists & tiles**: first-mount fade-up stagger (≤ 8 items, 30 ms apart) on lesson tiles, leaderboard rows, admin reader cards, badge grid; not on every re-render (key on route).
- **Dialogs/sheets/drawers**: keep shadcn defaults (already animated).

## 3. Badges (~50)
Owner: "make a lot more badges."

### Catalogue (single source of truth: `shared/badges.ts`)
Each badge: `{ id, category, tier: "bronze"|"silver"|"gold", icon: LucideIconName, tone, progress?: { metric, target } }`. Profile, toasts and server all read it. Existing 12 ids stay valid (migrate their definitions; no DB change needed — `user_badge` stores ids).

Categories and badges (names nl/en in locales; tier in brackets):
- **Streak**: 3 (B), 7 (B), 14 (S), 30 (S), 60 (G), 100 (G) days — existing streak_3/7/30 kept, add streak_14/60/100.
- **Kaarten**: 50 (B), 100 (B, existing cards_100), 500 (S, existing cards_500), 1000 (G), 2500 (G) reviews.
- **Quiz**: first quiz (B), first perfect (B, existing perfect_quiz), 5 perfect (S), 25 perfect (G), 80 %+ on 10 different lessons (S).
- **Uitleggen & open vragen**: first explanation (B), 90+ explanation (S, existing explain_master), 10 explanations (S), 10 open answers (B).
- **Meesterschap**: 1 lesson ≥ 90 % (B, existing lesson_master), 5 lessons (S), 10 lessons (G), a whole week mastered (S), a whole reader mastered (G).
- **Werelden** (tie-in with the lesson world; "mastered" = every lesson of that biome's week(s) ≥ 0.8 in any reader): Boswachter, Dorpeling, Stadsmens, Havenmeester, Jungle-expert, Woestijnnomade, Bergbeklimmer (S each), Afgestudeerd = campus finale reached/all lessons of a reader done (G).
- **Battle**: first battle (B), first win (B, existing battle_winner — keep its "3+ players" rule), 5 wins (S), 25 wins (G), 3 wins in a row (S), host a battle that is played to the end (B), perfect battle (all answers correct, ≥ 5 questions) (S).
- **Quests**: first quest (B), all 3 daily quests in one day (S), 10 quests (S), 50 quests (G).
- **Fun**: first steps (existing), night owl (existing), early bird (existing), weekend warrior (studied on both Saturday and Sunday of one weekend) (B), comeback (study again after ≥ 7 days without activity) (B), weekly top 3 (S) and weekly #1 (G) — awarded lazily: on the first XP event of a new Amsterdam week, rank last week's weekly leaderboard once and grant to the top 3 / #1 (idempotent; uses existing xp_event data; respects showOnLeaderboard=false users by excluding them like the leaderboard does).

### Awarding
- A single `checkBadges(userId, events)` on the server, called from the existing `award()` helper path and battle end, computing only the badges relevant to the event kinds (cheap counts with indexes). Idempotent via `grantBadge` (existing unique). Returns new badge ids → `XpResult.newBadges` (existing flow → toast).
- **Backfill**: a one-time idempotent backfill at server start (or migration script) that evaluates all count/threshold badges for every user from existing data, so existing accounts get what they already earned. No notification for backfilled badges.
- Progress for locked badges: `GET /api/me/badges` returns `{ id, earnedAt | null, progress?: {value, target} }` for all badges.

### Profile UI
Badge section grouped by category with headings; earned = coloured icon tile with a tier ring (bronze/silver/gold accent), locked = muted tile + small progress bar "142 / 500"; tap → popover with name, description, tier, progress/earned date. Counts "23 van 52".

## Controller calls (owner can override)
- Toasts top-center on mobile, bottom-right on desktop; max 3.
- View Transitions for page motion (no framer-motion) to keep the bundle small.
- Existing 12 badge ids preserved; backfill runs silently.
- "World" badges count a biome as finished when all its lessons (in any reader) are ≥ 0.8 mastery.
- Weekly top-3/#1 badges are granted lazily at the first XP event of the next week (no cron).
