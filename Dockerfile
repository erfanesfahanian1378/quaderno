# syntax=docker/dockerfile:1.7
#
# One image, two entrypoints: the web server and the worker.
#
# They share a codebase, a Prisma client and a node_modules tree, and building
# them separately means building all of that twice and keeping two Dockerfiles
# honest with each other. `docker compose` runs the same image with a different
# command — see compose.prod.yml.
#
# **Multi-arch by construction.** The target here is an Oracle Ampere box,
# which is arm64, while most laptops that build this are too. Nothing below
# pins an architecture: the base images are multi-arch, the apt packages come
# from the matching arm64/amd64 repos, and the two native npm dependencies
# (sharp, @node-rs/argon2) publish linux-arm64 prebuilds at the versions this
# project pins. Verified before committing to the platform, because "it is
# free but does not run" would not be a saving.

# ------------------------------------------------------------------------------
# deps — node_modules only, so a source edit does not reinstall the world
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Prisma detects the openssl version to pick a query engine, and without
# libssl present it guesses `openssl-1.1.x` — which bookworm does not ship.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Only the files that decide the dependency tree. Copying the whole repo here
# is the single most common reason a Docker build has no usable cache.
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ------------------------------------------------------------------------------
# build — Next standalone output
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma's client is generated code; the build imports it.
RUN pnpm prisma generate

# Placeholders, so `env()` validates if the build touches a route that calls it.
#
# There is no SKIP_ENV_VALIDATION escape hatch in src/server/env.ts and this
# does not add one — these are real values that satisfy the schema and are
# replaced by compose at runtime. They are deliberately obvious nonsense: a
# plausible-looking secret here is one somebody eventually ships.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    AUTH_SECRET="build-time-placeholder-build-time-placeholder" \
    S3_ENDPOINT="http://localhost:9000" \
    S3_BUCKET="placeholder" \
    S3_ACCESS_KEY_ID="placeholder" \
    S3_SECRET_ACCESS_KEY="placeholder"

RUN pnpm build

# ------------------------------------------------------------------------------
# runtime — the shared base for both processes
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# HOSTNAME is not decoration. Next's standalone server binds to $HOSTNAME, and
# Docker sets HOSTNAME to the container id — so left alone it listens on that
# name only: reachable from sibling containers, unreachable on 127.0.0.1. The
# app runs perfectly and its healthcheck fails for ever.
#
# (A comment cannot go inside a backslash-continued ENV; Docker treats the
# continuation as one line and the parse fails.)
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The worker shells out to all of these; the web process needs none of them.
# They live in the shared base anyway because keeping two runtime stages in
# step is a bigger cost than the disk, and the web container simply never
# calls them.
#
# `--no-install-recommends` matters more than usual here: LibreOffice
# recommends a desktop's worth of packages it does not need to convert a file
# headlessly.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-impress \
      libreoffice-calc \
      fonts-liberation \
      fonts-dejavu-core \
      poppler-utils \
      qpdf \
      ocrmypdf \
      tesseract-ocr \
      tesseract-ocr-ita \
      tesseract-ocr-fra \
      tesseract-ocr-deu \
      tesseract-ocr-spa \
      img2pdf \
      ca-certificates \
      openssl \
      curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Not root. The container writes only to /tmp during conversion, and a
# LibreOffice process that can be made to read a hostile file should not be
# doing it as uid 0.
RUN useradd --system --create-home --uid 10001 quaderno

# From BUILD, not deps.
#
# `prisma generate` writes the client AND its native query engine into
# node_modules/.prisma, and it runs in the build stage — so the deps tree
# predates it. Copying from deps produced an image that started, connected to
# nothing, and died with "could not locate the Query Engine for runtime
# linux-arm64-openssl-3.0.x", which reads as an architecture problem and is
# actually a stage-ordering one.
COPY --from=build --chown=quaderno:quaderno /app/node_modules ./node_modules
COPY --from=build --chown=quaderno:quaderno /app/.next/standalone ./
COPY --from=build --chown=quaderno:quaderno /app/.next/static ./.next/static
COPY --from=build --chown=quaderno:quaderno /app/public ./public
COPY --from=build --chown=quaderno:quaderno /app/prisma ./prisma
COPY --from=build --chown=quaderno:quaderno /app/worker ./worker
COPY --from=build --chown=quaderno:quaderno /app/src ./src
COPY --from=build --chown=quaderno:quaderno /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=quaderno:quaderno /app/package.json ./package.json

# LibreOffice writes a profile on first run and fails if it cannot.
RUN mkdir -p /home/quaderno/.config && chown -R quaderno:quaderno /home/quaderno

USER quaderno
EXPOSE 3000

# Overridden by the worker service. `server.js` is what `output: "standalone"`
# emits — not `next start`, which refuses to run against a standalone build.
CMD ["node", "server.js"]
