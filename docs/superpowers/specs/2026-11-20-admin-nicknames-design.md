# Admin: set other users' nicknames

Date: 2026-11-20. Size: small change. First of three jobs (nicknames → speed → whole-reader learning).

## Intent
Admins can set or clear the nickname of any user, for example to fix an inappropriate or confusing name on the leaderboard or in battles. The nickname is the name other people see.

## Goals / non-goals
- Goal: from the admin users table, edit or clear any user's nickname, using exactly the same rules as the profile page (`nicknameProblem` / `normalizeNickname` in `shared/limits.ts`, 2–24 characters, an empty value clears it).
- Non-goal: editing the real account `name` or email.
- Non-goal: locking a nickname so the student can't change it again. The owner chose plain editing.

## Approaches
- **Extend `PATCH /admin/users/:id` (chosen).** Accept an optional `nickname` next to `role`, and validate it with the same zod rule that `patchMe` uses. It's one endpoint and fits the existing table.
- A separate `PUT /admin/users/:id/nickname`. Rejected: an extra route for no benefit.

## How
- `server/lib/input.ts`: `patchUser` becomes `{ role?, nickname? }`, with at least one of them required. `nickname` reuses the `patchMe` nickname schema (normalised, `null`/empty clears it).
- `server/routes/admin.ts`: update only the fields that were sent. The self-demotion guard stays.
- `src/pages/admin/users.tsx`: each row gets an edit (pencil) action that opens a small dialog (a drawer on mobile) with the nickname field, `CharCounter` and the same validation message as the profile page. It has Save and "Clear nickname" buttons. A toast confirms, and the users query is refreshed.
- i18n strings in `nl` and `en`.
- Tests: the admin can set, normalise and clear a nickname; an invalid nickname gives 400; a non-admin gets 403.

## Left to the builder
The exact dialog layout and copy, within the existing admin styling.
