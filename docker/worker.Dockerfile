# The WORKER image. This is the fat one, and it is fat on purpose.
#
# LibreOffice is here and nowhere else (ARCHITECTURE.md §3, §9). It bursts to
# ~350 MB during a conversion, which is why conversion concurrency is 1 and
# why this process is separate from the web container — a conversion must
# never be able to take the app down with it.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=384

# Only the LibreOffice components that are actually used. The full
# `libreoffice` metapackage pulls in Base, Draw, Math and a JRE, none of which
# convert a handout.
RUN apt-get update && apt-get install --no-install-recommends -y \
      libreoffice-core \
      libreoffice-writer \
      libreoffice-impress \
      libreoffice-calc \
      qpdf \
      ocrmypdf \
      tesseract-ocr \
      tesseract-ocr-ita \
      tesseract-ocr-fra \
      tesseract-ocr-deu \
      tesseract-ocr-spa \
      fonts-liberation \
      fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate

# A writable HOME: soffice refuses to start without one, and each job still
# gets its own isolated UserInstallation profile on top.
ENV HOME=/tmp

CMD ["pnpm", "worker:start"]
