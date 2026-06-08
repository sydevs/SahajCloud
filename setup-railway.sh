#!/usr/bin/env bash
#
# Set the Railway env vars for the sahajcloud app service.
#
# Secrets are read from YOUR SHELL ENV (not hardcoded here), so this file holds
# no secret values and is safe to keep/commit. Non-secret config is pre-filled
# from the old wrangler.toml.
#
# Prereqs:
#   railway link --project bdff2c72-5af2-4da3-9e2c-913f5e9d1b0f
#   railway service            # select the APP service (not Postgres)
#   export PAYLOAD_SECRET=...   # etc. (see the required block below)
#   ./setup-railway.sh
#
# NOTE: DATABASE_URL is NOT set here — add it as a *reference* to the Postgres
#       service in the dashboard (app service → Variables → Add Reference →
#       Postgres → DATABASE_URL) so it uses Railway's internal networking.
set -euo pipefail

# ── Required secrets (export these before running, or the script aborts) ──────
: "${PAYLOAD_SECRET:?export PAYLOAD_SECRET=<EXISTING prod value — MUST match, or client API keys break>}"
: "${SAHAJCLOUD_PREVIEW_SECRET:?export SAHAJCLOUD_PREVIEW_SECRET=<existing prod value>}"
: "${CLOUDFLARE_API_KEY:?export CLOUDFLARE_API_KEY=<CF API token for Images + Stream>}"
: "${R2_ACCESS_KEY_ID:?export R2_ACCESS_KEY_ID=<R2 S3 token Access Key ID>}"
: "${R2_SECRET_ACCESS_KEY:?export R2_SECRET_ACCESS_KEY=<R2 S3 token Secret Access Key>}"
: "${RESEND_API_KEY:?export RESEND_API_KEY=<Resend API key>}"
: "${NEXT_PUBLIC_SENTRY_DSN:?export NEXT_PUBLIC_SENTRY_DSN=<Sentry DSN>}"

# ── Optional config / secrets (leave unset to skip) ──────────────────────────
# R2_S3_ENDPOINT: set ONLY for a jurisdiction-specific bucket, e.g. EU:
#   export R2_S3_ENDPOINT=https://c66c53a69689eb030b228c450515fff2.eu.r2.cloudflarestorage.com
R2_S3_ENDPOINT="${R2_S3_ENDPOINT:-}"
CLOUDFLARE_STREAM_WEBHOOK_SECRET="${CLOUDFLARE_STREAM_WEBHOOK_SECRET:-}"
DOCS_PASSWORD="${DOCS_PASSWORD:-}"
NIRMALA_VIDYA_API_KEY="${NIRMALA_VIDYA_API_KEY:-}"

# ── Non-secret config (from the old wrangler.toml) + the secrets above ───────
railway variables \
  --set "NODE_ENV=production" \
  --set "CLOUDFLARE_ACCOUNT_ID=c66c53a69689eb030b228c450515fff2" \
  --set "CLOUDFLARE_IMAGES_DELIVERY_URL=https://imagedelivery.net/dOm4imjweFFL1Pto29l-4Q" \
  --set "CLOUDFLARE_STREAM_DELIVERY_URL=https://customer-aorobtik2fce41s5.cloudflarestream.com" \
  --set "CLOUDFLARE_R2_DELIVERY_URL=https://assets.sydevelopers.com" \
  --set "R2_BUCKET=sahajcloud" \
  --set "WEMEDITATE_WEB_URL=https://wemeditate.com" \
  --set "SAHAJATLAS_URL=https://atlas.sydevelopers.com" \
  --set "PAYLOAD_SECRET=$PAYLOAD_SECRET" \
  --set "SAHAJCLOUD_PREVIEW_SECRET=$SAHAJCLOUD_PREVIEW_SECRET" \
  --set "CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY" \
  --set "R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID" \
  --set "R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY" \
  --set "RESEND_API_KEY=$RESEND_API_KEY" \
  --set "NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN"

# Optional ones — only set when provided
[ -n "$R2_S3_ENDPOINT" ] && railway variables --set "R2_S3_ENDPOINT=$R2_S3_ENDPOINT"
[ -n "$CLOUDFLARE_STREAM_WEBHOOK_SECRET" ] && railway variables --set "CLOUDFLARE_STREAM_WEBHOOK_SECRET=$CLOUDFLARE_STREAM_WEBHOOK_SECRET"
[ -n "$DOCS_PASSWORD" ] && railway variables --set "DOCS_PASSWORD=$DOCS_PASSWORD"
[ -n "$NIRMALA_VIDYA_API_KEY" ] && railway variables --set "NIRMALA_VIDYA_API_KEY=$NIRMALA_VIDYA_API_KEY"

echo "✓ Variables set on the active Railway service."
echo "→ Still TODO in the dashboard: add DATABASE_URL as a reference to the Postgres service."
echo "  Confirm WEMEDITATE_WEB_URL / SAHAJATLAS_URL match prod (these are the next.config fallbacks)."
