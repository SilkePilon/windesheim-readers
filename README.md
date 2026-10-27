<p align="center">
  <img src="public/brand/logo.svg" height="72" alt="Windesheim Readers">
</p>

<p align="center">
  Study a course reader through AI-generated lessons, flashcards, quizzes, audio lessons and live quiz battles.<br>
  Mobile-first, installable as an app, Dutch and English.
</p>

---

An admin uploads a reader PDF. The AI splits it into one lesson per paragraph and generates the study material from the full paragraph text. Students then walk a lesson path through a world that grows as they progress, practise with spaced repetition, and battle each other live.

## Features

**For students**
- **Lesson path**: a game-style road through hand-drawn worlds (forest, village, city, harbour, jungle, desert, mountains, campus). Each lesson's scenery builds up as you master it.
- **Summary**: key points and a searchable glossary per lesson.
- **Luisterles**: a 5–7 minute spoken audio lesson per paragraph, with real-world examples and a "Test jezelf" quiz at the end. It has chapters, speed control, lock-screen controls and resume.
- **Flashcards**: spaced repetition with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs), plus a daily review queue across all lessons.
- **Quiz**: multiple choice, true/false, fill-in-the-blank and ordering. Scoring is server-side.
- **Explain it** (Feynman) and **open questions**, both graded by AI with feedback.
- **AI tutor**: a streaming chat grounded in the lesson's pages of the reader.
- **Quiz Battle**: live multiplayer with a 6-digit code. The host sets the time per question, double points, question count and difficulty. It has a countdown, podium and presentation mode.
- **Progress**: XP, levels, streaks, daily quests, more than 50 badges, mastery per lesson, and weekly and all-time leaderboards (with opt-out and nicknames).
- **Look and language**: installable PWA, light and dark theme, Dutch and English.

**For admins**
- **Readers**: upload a PDF, review the AI's lesson split (codes, titles, weeks, page ranges), then generate content for everything, for missing lessons or for a single lesson. All generated content can be edited.
- **AI settings**: choose a provider and model per role: content generation, tutor and grading, and the voice for audio lessons. The providers are Gemini, Claude, OpenAI and OpenRouter, and model lists are fetched live. API keys are stored AES-GCM encrypted in the database.
- **Publishing and users**: publish and unpublish readers, and promote users to admin.

**Sign-in** is by email magic link only. It is limited to the configured domains: by default `@windesheim.nl` and `@student.windesheim.nl`.

## Stack

React 19 · Vite · Tailwind v4 · shadcn/ui · Hono on Bun · SQLite + Drizzle · better-auth · Vercel AI SDK · Resend · ts-fsrs

Everything runs as **one process**: it serves the API, the WebSocket for battles and the built web app on one port. All data lives in one SQLite file plus an uploads folder.

---

## Deploying

The CI builds a ready-to-run image for `linux/amd64` and `linux/arm64`:

```
ghcr.io/silkepilon/windesheim-readers
```

> If you forked the repo, use `ghcr.io/<your-github-user>/windesheim-readers`. The image name is always lowercase.

| Tag | When |
|---|---|
| `latest` | every push to `main` |
| `1.2.3`, `1.2`, `1` | when you push a tag `v1.2.3` |
| `sha-abc1234` | every build, for pinning an exact commit |

New GHCR packages are private by default. To let others pull without logging in, open the package on GitHub, go to **Package settings** and set **Change visibility** to *Public*.

### Configuration

All configuration is through environment variables.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `APP_SECRET` | **yes** | | Long random string (`openssl rand -base64 32`). Signs sessions and encrypts the stored AI keys. **Keep it the same forever**: changing it makes the saved AI keys unreadable. |
| `APP_URL` | **yes** | `http://localhost:5173` | Public URL of the site, used in sign-in emails, e.g. `https://readers.example.com`. |
| `ADMIN_EMAILS` | recommended | | Comma-separated. These users become admin when they sign in. |
| `ALLOWED_EMAIL_DOMAINS` | | `windesheim.nl,student.windesheim.nl` | Who may sign up. |
| `RESEND_API_KEY` | recommended | | [Resend](https://resend.com) key for sending sign-in emails. Without it, sign-in links are only printed in the server log. |
| `EMAIL_FROM` | | `Windesheim Readers <noreply@example.com>` | Sender address; it must be on a domain verified in Resend. |
| `PORT` | | `3000` | Port the server listens on. |
| `DATABASE_PATH` | | `/app/data/app.db` in the image | SQLite database file. |
| `UPLOAD_DIR` | | `/app/data/uploads` in the image | Uploaded PDFs and generated audio. |
| `CLIENT_IP_HEADER` | recommended behind a proxy | | Header holding the real client IP, used by the rate limits: `cf-connecting-ip` behind Cloudflare, `x-forwarded-for` (first entry is used) behind a proxy that overwrites it. Empty: the socket address. Only name a header your proxy always sets, or clients can pick their own IP. |
| `EMAIL_LIMIT_HOURLY` | | `30` | Most sign-in emails the server sends per rolling hour, all addresses together. |
| `EMAIL_LIMIT_DAILY` | | `100` | Same, per rolling 24 hours (Resend's free tier is 100 a day). |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | | | Optional fallback AI keys. Keys entered under **Admin → AI settings** take precedence. |

The container keeps everything under **`/app/data`**. Mount a volume there, or you lose your data when the container is replaced.

### Rate limits

All limits are enforced on the server and answer `429` with `{"error":"RATE_LIMITED","retryAfter":<seconds>}` and a `Retry-After` header; the app shows a "try again in …" message.

**Sign-in emails** have hard limits that are stored in the database, so a restart doesn't reset them. Every check-and-reserve is one SQLite transaction, so parallel requests can't slip past. The answer is the same whether or not an account exists.

| Sign-in emails | Limit |
|---|---|
| Per address | 1 per minute, 3 per 15 minutes, 6 per day |
| Per IP | 5 per 15 minutes, 20 per day |
| Everyone together | `EMAIL_LIMIT_HOURLY` per hour, `EMAIL_LIMIT_DAILY` per day |

**Everything else** is counted in memory (it resets on restart). IPv6 addresses count per /64.

| What | Per | Limit |
|---|---|---|
| Every `/api` request (except `/api/health`) | IP | 600 per minute |
| `/api/auth/*` (sign-in, link checks, sign-out) | IP | 30 per 10 minutes |
| Sign-in requests | IP | 10 per 10 minutes |
| `GET /api/auth/get-session` | IP | 300 per minute |
| AI: tutor chat, open-answer grading, explain grading (one shared bucket) | user | 20 per 5 minutes, 150 per day |
| Progress and XP writes (reviews, quiz checks and submits, read, listen progress, profile) | user | 120 per minute |
| Admin AI calls (key checks, model lists, test prompt, voice models and samples) | admin | 30 per 10 minutes |
| Admin uploads and jobs (upload, retry, restructure, generate, audio, badge backfill) | admin | 30 per hour |
| Battle connections | IP | 30 per minute |
| Battle messages | connection | 20 per 2 seconds; extra ones are dropped, repeat offenders are disconnected |
| Creating a battle | user | 10 per 10 minutes |
| Joining a battle | user | 20 per minute |

better-auth's own limiter stays on as well (for example 3 sign-in requests per 10 seconds per IP).

Set `CLIENT_IP_HEADER` when the app runs behind a proxy. Without it, every visitor looks like the proxy and shares one budget. Many students behind one campus NAT address also share the per-IP budgets; the per-user limits are not affected.

The limits are in `server/limits.ts` and `server/lib/email-gate.ts`. For local testing only, `RATE_LIMIT_DISABLED=1` turns them all off; it is ignored when `NODE_ENV=production`.

### Option 1: Docker

```bash
docker run -d --name readers --restart unless-stopped \
  -p 3000:3000 \
  -v readers-data:/app/data \
  -e APP_SECRET="$(openssl rand -base64 32)" \
  -e APP_URL=https://readers.example.com \
  -e ADMIN_EMAILS=you@windesheim.nl \
  -e RESEND_API_KEY=re_... \
  -e EMAIL_FROM="Windesheim Readers <noreply@your-domain.nl>" \
  ghcr.io/silkepilon/windesheim-readers:latest
```

> Generate `APP_SECRET` once and store it somewhere safe. The one-liner above makes a new secret every time you run it, so use a fixed value for real deployments, for example in an env file.

Or use **Docker Compose** with the included [`docker-compose.yml`](docker-compose.yml):

```bash
cp .env.example .env   # fill in APP_SECRET, APP_URL, ADMIN_EMAILS, RESEND_API_KEY, EMAIL_FROM
docker compose up -d
```

To build the image yourself instead, run `docker build -t windesheim-readers .`, or uncomment `build: .` in the compose file.

**Put HTTPS in front of it.** Use any reverse proxy (Caddy, Traefik, nginx) and point it at port 3000. The proxy must:
- allow **WebSocket upgrades** on `/api/battle/ws`, which battles need;
- accept request bodies of at least **50 MB**, for PDF uploads;
- allow long read timeouts, because AI requests can take a minute or more.

With Caddy, all of that is the default:

```
readers.example.com {
    reverse_proxy localhost:3000
}
```

### Option 2: Kubernetes

Ready-made manifests are in [`deploy/kubernetes`](deploy/kubernetes): a namespace, ConfigMap, PersistentVolumeClaim, Deployment, Service and Ingress, combined with Kustomize.

1. **Settings**: edit `deploy/kubernetes/configmap.yaml` (`APP_URL`, `ADMIN_EMAILS`, `EMAIL_FROM`, `CLIENT_IP_HEADER`). Then edit the host names in `ingress.yaml`. It is written for ingress-nginx; with cert-manager, uncomment the issuer annotation.
2. **Image tag**: optionally pin a version in `kustomization.yaml` (`newTag: 1.2.3`).
3. **Secret**: create it once. It is deliberately kept out of the kustomization, so it never lands in git:
   ```bash
   kubectl create namespace windesheim-readers
   kubectl -n windesheim-readers create secret generic windesheim-readers \
     --from-literal=APP_SECRET="$(openssl rand -base64 32)" \
     --from-literal=RESEND_API_KEY=re_...
   ```
   (Or copy `secret.example.yaml` to `secret.yaml`, fill it in and apply that file.)
4. **Deploy**:
   ```bash
   kubectl apply -k deploy/kubernetes
   kubectl -n windesheim-readers rollout status deploy/windesheim-readers
   ```

If the image is private, add an `imagePullSecret` for `ghcr.io`.

**Run exactly one replica.** The database is SQLite on a ReadWriteOnce volume. Live battles and generation jobs also run in memory. The Deployment therefore uses `replicas: 1` and the `Recreate` strategy, so a new pod never starts while the old one still holds the database.

**Health checks.** `GET /api/health` returns `{"ok":true}` once the database answers. It is used by the Docker `HEALTHCHECK` and by the Kubernetes probes.

### After the first start

1. Open the site and sign in with an address from `ADMIN_EMAILS`.
2. Go to **Admin → AI settings**:
   - Add an API key. Gemini is a good default: it covers content, the tutor and the voice.
   - Pick models with the test button.
   - Under **Stem**, choose a voice and try it with **Probeer stem**.
3. Go to **Admin → Readers** and upload a reader PDF. Check the lesson split, then generate the content.
4. Optionally press **Genereer audio** to generate the Luisterles audio lessons. Each lesson costs one script call plus about 6 minutes of text-to-speech on your key.
5. Publish the reader. Students can now sign in.

### Updating

- **Docker:** run `docker compose pull && docker compose up -d`, or pull the image and recreate the container.
- **Kubernetes:** change the tag and `kubectl apply -k`, or run `kubectl -n windesheim-readers rollout restart deploy/windesheim-readers` when you track `latest`.

Database migrations run automatically on start. Make a backup before upgrading.

### Backups

Everything is in the data volume. To make a consistent copy of the database while the app keeps running:

```bash
# Docker / Compose (use `docker compose exec app` with Compose)
docker exec readers bun -e "import {Database} from 'bun:sqlite'; new Database('/app/data/app.db').exec(\"VACUUM INTO '/app/data/backup.db'\")"
docker cp readers:/app/data/backup.db ./readers-$(date +%F).db

# Kubernetes
kubectl -n windesheim-readers exec deploy/windesheim-readers -- bun -e "import {Database} from 'bun:sqlite'; new Database('/app/data/app.db').exec(\"VACUUM INTO '/app/data/backup.db'\")"
kubectl -n windesheim-readers cp "$(kubectl -n windesheim-readers get pod -l app=windesheim-readers -o name | cut -d/ -f2)":/app/data/backup.db ./readers-$(date +%F).db
```

Also back up `/app/data/uploads` (the PDFs and the generated audio) if you don't want to regenerate them. To restore, stop the app, replace `app.db` (and remove any `app.db-wal`/`app.db-shm` next to it), then start it again.

---

## Development

You need [Bun](https://bun.sh) 1.4 or newer.

```bash
bun install
cp .env.example .env     # set APP_SECRET and ADMIN_EMAILS
bun run dev              # API on :3000, web on http://localhost:5173
```

Without `RESEND_API_KEY`, sign-in links are printed in the API console. Sign in with an `ADMIN_EMAILS` address, add an AI key under **Admin → AI settings**, and upload a reader.

| Command | |
|---|---|
| `bun run dev` | API (with reload) and Vite dev server |
| `bun run typecheck` | TypeScript check |
| `bun test` | Unit tests. They use a temporary database and never touch `./data`. |
| `bun run test:e2e` | API end-to-end tests against a throwaway server on port 3200 with a stub AI provider and rate limits off (`tests/rate-limit-app.test.ts` covers the app with them on) |
| `bun run build` | Typecheck and production build of the web app into `dist/` |
| `bun run start` | Production server (serves `dist/`) |
| `bun run db:generate` | Create a migration after changing `server/db/schema.ts` |

**Project layout**

```
src/            React app: pages, components, lesson world, locales (nl/en)
server/         Hono API: auth, routes, AI pipeline (content, tutor, audio), battles, migrations
shared/         Code shared by client and server (badges, battle rules)
tests/          Unit tests (bun test)
scripts/e2e/    End-to-end API tests
deploy/         Kubernetes manifests
docs/           Design specs and plans
```

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request.
1. **Test job:** typecheck, unit tests, production build and end-to-end tests.
2. **Image job:** builds the Docker image, starts it and checks `/api/health` plus a clean shutdown.
3. **Publishing:** on `main` and on `v*` tags, it pushes a multi-arch image (amd64 + arm64) to GHCR. Pull requests build and smoke-test the image without pushing.

To cut a release:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## Learning design

The app is built on evidence about what works for studying:
- **Retrieval practice and spacing** are the most effective study techniques (Dunlosky et al. 2013; Donoghue & Hattie 2021). Hence the FSRS flashcards, the daily review, the quizzes and the "Test jezelf" at the end of every audio lesson.
- **Elaboration and self-explanation** come through "Explain it" and open questions with AI feedback.
- **Audio lessons** follow multimedia-learning principles. They use a conversational, personal tone, short segments with clear signposting, concrete real-world examples, and a recap with recall questions.
- **Gamification** helps on average but varies a lot, and leaderboards can demotivate some students. So the main leaderboard resets weekly, students can hide themselves, quiz XP decreases after repeated attempts, and progress is shown as personal mastery rather than only rank.
