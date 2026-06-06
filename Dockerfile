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
# The root "postinstall" lifecycle (node scripts/postinstall.cjs) runs during
# install — copy it so the install doesn't crash on a missing file. It no-ops
# when CI=true (set above), so no Playwright download happens here.
COPY scripts/postinstall.cjs ./scripts/postinstall.cjs
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
# Build-time placeholders so serverEnv (zod) validation passes during `next build`.
# Scoped to this RUN (not ENV) so they never persist into the image and don't trip
# Docker's secret-in-ENV lint — these are throwaway, NOT real secrets; Railway
# injects the real service values at runtime.
RUN PAYLOAD_SECRET=build-time-placeholder-secret-0000000 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    WEMEDITATE_WEB_URL=https://wemeditate.com \
    SAHAJATLAS_URL=https://atlas.sydevelopers.com \
    SAHAJCLOUD_PREVIEW_SECRET=build-time-placeholder-secret \
    pnpm build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# Copy the full app (including node_modules) so the Payload CLI is available for
# `pnpm db:migrate` in the Railway preDeployCommand.
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]
