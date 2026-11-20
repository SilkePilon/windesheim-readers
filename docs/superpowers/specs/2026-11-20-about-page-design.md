# About page

Date: 2026-11-20. Size: small change. Order of jobs: About → feedback & issues → speed → whole-reader learning.

## Intent
One page about the site (not about a user) that explains why Windesheim Readers exists, says it is fully open source, and says anyone can host it themselves with Docker to customise their own experience and learning. It ends with a card about the maker.

## Goals / non-goals / anti-goals
- Goals:
  - a public `/about` page, readable without logging in, in nl and en;
  - a link to https://github.com/SilkePilon/windesheim-readers;
  - a short self-hosting teaser (Docker) that links to the README's deploy section;
  - a maker card with photo and text.
- Non-goals:
  - no per-user content;
  - no feedback form here (the feedback job adds its own entry points);
  - no changelog.
- Anti-goal: the mobile dock must not get a 6th item.

## Approaches
- **Own page, desktop rail item + links (chosen).** The desktop rail gets an About item, placed above the admin divider. On phones it is a row on the profile page plus a link on the login screen.
- A dock item everywhere. Rejected: it makes the phone dock crowded.
- A section on the profile page. Rejected by the owner: it's about the site, not the user.

## Content (draft copy; the owner edits the final wording)
- **Hero:** the logo, "Windesheim Readers", and the line "Leer je reader zoals jij wilt leren."
- **Why:** "Readers zijn dik en tentamens komen snel. Ik wilde een plek waar je een reader niet alleen leest, maar echt leert: korte lessen, flashcards die terugkomen op het juiste moment, quizzen, luisterlessen en battles met je klasgenoten. Gemaakt door een student, voor studenten."
- **Open source:** "Alles is open source. Je kunt de code lezen, verbeteren of meebouwen op GitHub." The button says "Bekijk op GitHub" and links to the repo.
- **Self-host:** "Zelf hosten? Met één Docker-container draai je je eigen versie, met je eigen readers, AI-modellen en instellingen." The button says "Zo host je het zelf" and links to the README `#deploying` anchor.
- **Maker card:**
  - photo: the GitHub avatar of SilkePilon;
  - name: **Silke Pilon**;
  - "Eerstejaars student HBO-ICT aan Windesheim";
  - a GitHub profile link.
- Every line also exists in English.

## How
- Route `/about` sits outside the auth guard in `src/App.tsx`, lazy-loaded. When logged in it renders inside the app shell; when logged out it renders standalone with a back link to login.
- `nav-items.ts`: a new `about` key (lucide `Info`) shown **only in the desktop rail**. Not in `NAV_ITEMS`, so the dock is unchanged.
- Profile page: an "Over deze app" row that links to `/about`. Login page: a small "Over" link.
- **Avatar (my call):** download `https://github.com/SilkePilon.png?size=256` once and commit it as `public/brand/maker.jpg`. Visitors then never send a request to GitHub, and it works offline in the PWA. If the photo changes, re-download it.
- Speelveld styling (cards, chunky shadows), mobile-first, light and dark themes.
- Tests: the route renders logged out; the dock items are unchanged; nl and en keys exist.

## Left to the builder
Exact layout and icons within the existing design language.
