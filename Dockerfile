# syntax=docker/dockerfile:1
#
# Runtime image for the Next.js + Payload app on Railway (Node).
#
# - Build:  `pnpm build` (Next + Payload). Railway exposes service variables to a
#           Dockerfile build as build ARGs (not auto-env), so the build stage
#           declares the ones `next build` needs and passes them through — both
#           serverEnv (zod) validation and the build-time CSP frame-src in
#           next.config read them (e.g. WEMEDITATE_WEB_URL). Real values from
#           Railway, no hardcoding; nothing persists into the runtime image.
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
# Railway provides service variables to a Dockerfile build as build args; declare
# the ones `next build` validates (serverEnv) or bakes in (next.config's CSP
# frame-src reads WEMEDITATE_WEB_URL / SAHAJATLAS_URL at build time) and pass them
# inline to the build — scoped to this RUN, so they're not baked into the image
# layers and don't trip Docker's secret-in-ENV lint.
ARG PAYLOAD_SECRET
ARG DATABASE_URL
ARG WEMEDITATE_WEB_URL
ARG SAHAJATLAS_URL
ARG SAHAJCLOUD_PREVIEW_SECRET
RUN PAYLOAD_SECRET="$PAYLOAD_SECRET" \
    DATABASE_URL="$DATABASE_URL" \
    WEMEDITATE_WEB_URL="$WEMEDITATE_WEB_URL" \
    SAHAJATLAS_URL="$SAHAJATLAS_URL" \
    SAHAJCLOUD_PREVIEW_SECRET="$SAHAJCLOUD_PREVIEW_SECRET" \
    pnpm build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# Copy the full app (including node_modules) so the Payload CLI is available for
# `pnpm db:migrate` in the Railway preDeployCommand.
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]
