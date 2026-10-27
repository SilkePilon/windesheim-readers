# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.4

# --- Build the web app (Vite → dist/) ---
FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bunx vite build

# --- Production dependencies only ---
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- Runtime ---
FROM oven/bun:${BUN_VERSION}-slim
WORKDIR /app

ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Windesheim Readers" \
      org.opencontainers.image.description="Learn a course reader through AI-generated lessons, flashcards, quizzes, audio and live battles." \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/app.db \
    UPLOAD_DIR=/app/data/uploads

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared

# Run as the unprivileged "bun" user (uid 1000) that ships with the image.
RUN mkdir -p /app/data/uploads && chown -R bun:bun /app/data
USER bun

VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["bun", "server/index.ts"]
