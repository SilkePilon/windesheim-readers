# About Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, bilingual `/about` page (why the site exists, open source, self-hosting with Docker, maker card), reachable from the desktop rail, the profile page and the login screen.

**Architecture:** A lazy-loaded `src/pages/about.tsx` on a route outside `RequireAuth`. When logged in, the page wraps itself in `AppLayout`, the way `src/pages/battle/index.tsx` picks its own shell. When logged out, it renders standalone. The desktop rail gets its own item list (the dock's items plus About), so the phone dock is unchanged.

**Tech Stack:** React 19, react-router, react-i18next, Tailwind v4 + shadcn/ui, lucide-react, bun test (`renderToString`, as in `tests/world-map.test.tsx`).

**Spec:** `docs/superpowers/specs/2026-11-20-about-page-design.md`

## Global Constraints

- Repo link: `https://github.com/SilkePilon/windesheim-readers`. Self-host link: `https://github.com/SilkePilon/windesheim-readers#deploying`. Maker profile: `https://github.com/SilkePilon`.
- Maker card: the name **Silke Pilon**; nl "Eerstejaars student HBO-ICT aan Windesheim"; en "First-year HBO-ICT student at Windesheim".
- The Dutch copy is taken verbatim from the spec's "Content" section. English is a faithful translation.
- The avatar is a committed static file `public/brand/maker.jpg` (from `https://github.com/SilkePilon.png?size=256`). There is no runtime request to GitHub.
- The mobile dock (`FloatingDock`) items are unchanged: the 5 student items, plus admin for admins.
- Mobile-first, works at phone width, light and dark themes, Speelveld styling (Card, chunky shadow `shadow-[0_4px_0_var(--chunky)]`).
- External links use `target="_blank" rel="noopener noreferrer"`.

## Review Focus

- A logged-out visitor opens `/about`: the page renders with no redirect to `/login` and no app shell, and shows a link back to `/login`. (Task 1 test.)
- A logged-in user opens `/about`: the rail and dock are shown, and the rail marks About as active. (Task 2 test via `isNavActive`; manual check for the shell.)
- The phone dock never shows About. (Task 2 test.)
- English locale: every About string resolves, with no raw `about.*` keys rendered. (Task 1 test renders with `en`.)
- The avatar has meaningful alt text, and the page still lays out if the image fails to load (fixed-size box). (Task 1, manual.)

---

### Task 1: The About page, route, copy and avatar

**Files:**
- Create: `src/pages/about.tsx`, `public/brand/maker.jpg`
- Modify: `src/App.tsx` (lazy route `/about` outside `RequireAuth`), `src/locales/nl.ts`, `src/locales/en.ts` (`about.*` keys)
- Test: `tests/about.test.tsx`

**Interfaces:**
- Produces: the route `/about`; the default export `AboutPage`; the i18n key `nav.about` ("Over" / "About") used by Task 2.

- [ ] **Step 1: Write the failing test** `tests/about.test.tsx`. Render `<AboutContent />` (a named export from `about.tsx` without the shell, so the test needs no query client) with `renderToString` inside an i18n instance and a `MemoryRouter`, once for `nl` and once for `en`. Assert:
  - the HTML contains `https://github.com/SilkePilon/windesheim-readers`, `#deploying`, `Silke Pilon` and `/brand/maker.jpg`;
  - nl contains "Eerstejaars student HBO-ICT aan Windesheim", and en contains "First-year HBO-ICT student at Windesheim";
  - neither contains the substring `about.` (no unresolved keys).
- [ ] **Step 2: Run** `bun test tests/about.test.tsx` and confirm it fails (the module is missing).
- [ ] **Step 3: Implement.**
  - Download the avatar: `curl -sL "https://github.com/SilkePilon.png?size=256" -o public/brand/maker.jpg` (check it is a JPEG/PNG; if PNG, save as `maker.png` and use that path everywhere).
  - `about.tsx` exports `AboutContent` (the sections: hero, why, open source + button, self-host + button, maker card) and the default `AboutPage`. `AboutPage` uses `useMe()`. While loading it shows `PageSpinner`. Logged in: `<AppLayout><AboutContent/></AppLayout>`. Logged out: a centred standalone layout with a "← Inloggen"/"← Sign in" link to `/login` above `AboutContent`.
  - In `App.tsx`, add a top-level `<Route path="/about" element={<Suspense fallback={<PageSpinner/>}><AboutPage/></Suspense>} />` with `AboutPage = lazy(() => import("@/pages/about"))`.
- [ ] **Step 4: Run** `bun test && bun run typecheck` and expect PASS.
- [ ] **Step 5: Commit** `feat(about): public about page with open-source, self-host and maker card`

### Task 2: Entry points (desktop rail, profile row, login link)

**Files:**
- Modify: `src/components/shell/nav-items.ts`, `src/components/app-layout.tsx`, `src/pages/profile.tsx`, `src/pages/login.tsx`, `src/locales/nl.ts`, `src/locales/en.ts`
- Test: `tests/nav-items.test.ts`

**Interfaces:**
- Consumes: the route `/about` and `nav.about` from Task 1.
- Produces:
  - `NavItem.key` gains `"about"`;
  - `ABOUT_ITEM: NavItem = { to: "/about", key: "about", icon: Info }`;
  - `railItems(items: NavItem[]): NavItem[]` (a pure function) inserts `ABOUT_ITEM` before the admin item, or appends it when there is no admin item.

- [ ] **Step 1: Write the failing test** `tests/nav-items.test.ts`:
  - `railItems(NAV_ITEMS).map(i => i.key)` equals `["path","review","battle","leaderboard","profile","about"]`;
  - `railItems([...NAV_ITEMS, ADMIN_ITEM])` ends with `["about","admin"]`;
  - `NAV_ITEMS` does not contain `"about"`;
  - `isNavActive("/about", "/about")` is true.
- [ ] **Step 2: Run** `bun test tests/nav-items.test.ts` and confirm it fails.
- [ ] **Step 3: Implement.**
  - `AppLayout` passes `railItems(items)` to `DesktopRail` and `items` (unchanged) to `FloatingDock`.
  - Profile: add a link row "Over deze app"/"About this app" (lucide `Info`, chevron) in the settings `Card`, after `InstallRow`, matching the existing row styling.
  - Login: a small, muted "Over Windesheim Readers"/"About Windesheim Readers" link to `/about` below the form.
- [ ] **Step 4: Run** `bun test && bun run typecheck && bunx vite build` and expect PASS.
- [ ] **Step 5: Commit** `feat(about): reach the about page from the rail, profile and login`
