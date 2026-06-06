# syntax=docker/dockerfile:1
#
# Runtime image for the Next.js + Payload app on Railway (Node).
#
# - Build:  `pnpm build` (Next + Payload). Real env vars come from Railway; the
#           build-time placeholders below ONLY satisfy serverEnv (zod) validation
#           during `next build` and are NOT used at runtime (mirrors the CI build).
# - Start:  `pnpm start` (next start). Pending Postgres migrations run as a
#           Railway preDeployCommand (`pnpm db:migrate`) — see railway.toml.

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NODE_OPTIONS="--no-deprecation" \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN corepack enable
WORKDIR /app

# ── Install dependencies (layer cached on the lockfile) ───────────────────────
FROM base AS deps
# pnpm-workspace.yaml carries the build-script approvals (allowBuilds) + settings
# pnpm 11 needs, so copy it alongside the manifest + lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# CI=true makes scripts/postinstall.cjs skip the Playwright browser download.
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholders so serverEnv (zod) validation passes during `next build`.
# These are NOT secrets and are NOT used at runtime — Railway injects the real
# service values for the running container.
ENV NODE_ENV=production \
    PAYLOAD_SECRET=build-time-placeholder-secret-0000000 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    WEMEDITATE_WEB_URL=https://wemeditate.com \
    SAHAJATLAS_URL=https://atlas.sydevelopers.com \
    SAHAJCLOUD_PREVIEW_SECRET=build-time-placeholder-secret
RUN pnpm build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# Copy the full app (including node_modules) so the Payload CLI is available for
# `pnpm db:migrate` in the Railway preDeployCommand.
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]
