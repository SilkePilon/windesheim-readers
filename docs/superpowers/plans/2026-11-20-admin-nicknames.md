# Admin Nicknames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can set or clear any user's nickname from the admin users table.

**Architecture:** Extend the existing `PATCH /api/admin/users/:id` to accept an optional `nickname` (reusing the shared `nickname` zod schema from `server/lib/input.ts`), then add a pencil action per row in `src/pages/admin/users.tsx` that opens a dialog with the same validation as the profile page.

**Tech Stack:** Hono on Bun, zod, Drizzle/SQLite, React 19, shadcn/ui (`dialog.tsx`), react-i18next, bun test.

**Spec:** `docs/superpowers/specs/2026-11-20-admin-nicknames-design.md`

## Global Constraints

- Nickname rule is exactly the shared one: `nicknameProblem` / `normalizeNickname` in `shared/limits.ts` (2–24 characters, normalized; empty or `null` clears).
- Only the nickname is editable. The real `name` and the email are not.
- No nickname lock.
- All UI copy is in both `src/locales/nl.ts` and `src/locales/en.ts`.

## Review Focus

- PATCH for a user id that doesn't exist: expect 404 `NOT_FOUND`, not a silent 200. (Added to Task 1's test.)
- A body with neither `role` nor `nickname` (`{}`): expect 400 `VALIDATION`. (Task 1.)
- Only a nickname is sent for your own admin account: the self-demotion guard must not fire, because `role` is undefined. (Task 1.)
- A non-admin calling the endpoint: 403, and nothing changes. (Task 1.)
- The dialog opened for a user without a nickname shows an empty field with the real name as placeholder, and saving it unchanged sends nothing. (Task 2, manual check.)

---

### Task 1: API accepts `nickname` on PATCH /admin/users/:id

**Files:**
- Modify: `server/lib/input.ts:247` (`patchUser`)
- Modify: `server/routes/admin.ts:417-423`
- Test: `tests/input-limits.test.ts` (schema), `tests/input-limits-app.test.ts` (route, inside `describe("admin endpoints")`)

**Interfaces:**
- Produces: `PATCH /api/admin/users/:id` body `{ role?: "user" | "admin"; nickname?: string | null }`, at least one key, strict. Responses: `200 { ok: true }`, `400 VALIDATION`, `400 CANNOT_DEMOTE_SELF`, `404 NOT_FOUND`.

- [ ] **Step 1: Write the failing tests**

In `tests/input-limits.test.ts`, add `describe("patchUser (admin)")`:
```ts
expect(patchUser.parse({ nickname: "  Zoë   B " })).toEqual({ nickname: "Zoë B" });
expect(patchUser.parse({ nickname: "" })).toEqual({ nickname: null });
expect(patchUser.parse({ nickname: null })).toEqual({ nickname: null });
expect(patchUser.parse({ role: "admin" })).toEqual({ role: "admin" });
expect(() => patchUser.parse({})).toThrow();
expect(() => patchUser.parse({ nickname: "x".repeat(25) })).toThrow();
expect(() => patchUser.parse({ name: "Bob" })).toThrow();
```

In `tests/input-limits-app.test.ts`, add the test `"admin sets, normalises and clears a user's nickname"`. Look up the student's id from `schema.user` by `limits-student@student.windesheim.nl`, then:
- `PATCH /admin/users/<id> { nickname: "  Mod  Set " }` as admin → 200, and the DB nickname is `"Mod Set"`.
- `{ nickname: "" }` → 200, and the DB nickname is `null`.
- `{ nickname: "x".repeat(25) }` → `400 VALIDATION`.
- `{}` → `400 VALIDATION`.
- `PATCH /admin/users/does-not-exist { nickname: "Ann" }` → `404 NOT_FOUND`.
- The admin's own id with `{ nickname: "Boss" }` → 200, and the role is still `admin`.
- As `student` (non-admin), `{ nickname: "Hax" }` → 403, and the DB is unchanged.

Reset the student's nickname to `null` at the end so later tests in the file aren't affected.

- [ ] **Step 2: Run the tests and check they fail**

Run: `bun test tests/input-limits.test.ts tests/input-limits-app.test.ts`
Expected: FAIL. `patchUser` refuses `nickname`, and the route ignores it.

- [ ] **Step 3: Implement**

- `patchUser = z.object({ role: z.enum(["user","admin"]).optional(), nickname: nickname.nullable().optional() }).strict().refine((b) => b.role !== undefined || b.nickname !== undefined)`. A refine failure must surface as `VALIDATION`, like the other zod errors (check that the existing error middleware maps it).
- Route: return `404 { error: "NOT_FOUND" }` when the user row doesn't exist. Keep the self-demotion guard but only when `role !== undefined`. Update only the keys that are defined. Use the error code shape the other admin routes use for 404 (grep `NOT_FOUND` in `server/routes/admin.ts`).

- [ ] **Step 4: Run the tests and check they pass**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/input.ts server/routes/admin.ts tests/input-limits.test.ts tests/input-limits-app.test.ts
git commit -m "feat(admin): set or clear a user's nickname via PATCH /admin/users/:id"
```

### Task 2: Edit-nickname dialog in the admin users table

**Files:**
- Create: `src/components/admin/nickname-dialog.tsx`
- Modify: `src/pages/admin/users.tsx`
- Modify: `src/locales/nl.ts`, `src/locales/en.ts` (`admin.nickname.*` keys)

**Interfaces:**
- Consumes: Task 1's PATCH body `{ nickname: string | null }`.
- Produces: `NicknameDialog({ user, open, onOpenChange, onSaved }: { user: { id: string; name: string; nickname: string | null } | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => Promise<unknown> })`.

- [ ] **Step 1: Build `NicknameDialog`**

Use shadcn `Dialog` from `@/components/ui/dialog`. The field mirrors the profile page's `NicknameRow`: live `nicknameProblem` check, `CharCounter` with `LIMITS.nickname.max`, `maxLength`, the real name as placeholder, and the reused `profile.nicknameInvalid` error text with `role="alert"` and `aria-invalid`. Buttons: "Opslaan"/"Save" (disabled while invalid or unchanged after `normalizeNickname`) and "Bijnaam wissen"/"Clear nickname" (only when the user has a nickname, sends `null`). While saving, disable both buttons. On success: `notify.success(t("admin.nickname.saved"))`, `await onSaved()`, close. On error: `notify.error(errorText(e, t))`.

- [ ] **Step 2: Wire it into `users.tsx`**

Add a pencil `Button` (`variant="ghost" size="icon"`, lucide `Pencil`, `aria-label={t("admin.nickname.edit", { name: display })}`) next to the display name in each row. Keep one `editing: UserRow | null` state and render a single `NicknameDialog`, with `onSaved={refetch}`.

- [ ] **Step 3: Verify**

Run: `bun test && bun run typecheck`
Expected: PASS, with no type errors. Then check manually in the dev app (`bun run dev` from this checkout, never the demo worktree): set, normalise, clear, an invalid name shows the error, unchanged saves are disabled, and it works at phone width.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/nickname-dialog.tsx src/pages/admin/users.tsx src/locales/nl.ts src/locales/en.ts
git commit -m "feat(admin): edit a user's nickname from the users table"
```
