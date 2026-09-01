/**
 * Preview / non-production storage isolation (Cloudflare Images, Stream, R2).
 *
 * Images, Stream, and R2 are account/bucket-scoped resources shared by EVERY
 * deployment of this app: production, Railway per-PR previews, staging, and
 * local dev all talk to the same Cloudflare account + R2 bucket. Cloned preview
 * databases reference real production asset IDs, so without isolation a preview
 * deploy could upload into — or, far worse, DELETE from — the production
 * namespace (issue #432).
 *
 * Strategy ("Option B" — namespacing within the single account):
 *  - Non-production uploads carry a `preview-` marker: an object-ID/key prefix
 *    for Images + R2, and a `meta.env=preview` tag for Stream (whose UIDs are
 *    assigned by Cloudflare, not the caller).
 *  - Non-production deletes are GUARDED — an adapter refuses to delete any asset
 *    that does not carry the marker, so a preview can never destroy a prod asset.
 *  - A scheduled job (`scripts/cleanup-preview-assets.ts`) reaps marked assets.
 *
 * Production is untouched: every helper here is a no-op when
 * `isProductionDeployment()` is true, honouring the "no new code paths in the
 * production data plane" constraint — prod keeps its exact existing behaviour
 * (no prefix, no guard, no extra API calls).
 *
 * See `docs/rules/storage.md` § "Preview / non-production isolation".
 */

import { storageLogger } from './storageLogger'

/**
 * Name of the production Railway environment.
 *
 * Production is detected by the platform-injected Railway environment name —
 * NOT by `NODE_ENV` (Railway previews also run `NODE_ENV=production`) and NOT by
 * `SAHAJCLOUD_URL` (a shared service variable that Railway PR previews INHERIT
 * from production, so the origin is identical on a preview and on prod and
 * cannot tell them apart). Railway injects `RAILWAY_ENVIRONMENT(_NAME)` per
 * environment: production is `production`; PR previews are `pr-<number>` (see
 * RAILWAY_RUNBOOK.md). These vars are present at build + runtime (see
 * `scripts/postinstall.cjs`).
 */
export const PRODUCTION_ENVIRONMENT_NAME = 'production'

/**
 * Marker prepended to Cloudflare Images custom IDs and R2 object keys in
 * non-prod. Ownership is detected via `startsWith(PREVIEW_ASSET_PREFIX)`.
 *
 * KNOWN LIMITATION (inherent to Option B's policy-based marking — see #432): a
 * production asset whose generated ID/key legitimately begins with `preview-`
 * (e.g. a prod upload named "preview-banner.jpg") is classified as
 * preview-owned. The cleanup job's marker-AND-age condition bounds the blast
 * radius, but such an asset could in principle be deleted from a preview. If
 * this surfaces in practice, harden the marker to a token the slug generator
 * (lowercased `[a-z0-9-]`) cannot produce.
 */
export const PREVIEW_ASSET_PREFIX = 'preview-'

/** Cloudflare Stream `meta` key/value stamped on non-prod video uploads. */
export const PREVIEW_STREAM_META_KEY = 'env'
export const PREVIEW_STREAM_META_VALUE = 'preview'

/**
 * The current Railway environment name, or `undefined` off-Railway (local, CI,
 * test). Reads `process.env` directly so the result reflects the live env and
 * stays trivially testable — the pattern `payload.config.ts` uses for
 * `process.env.NODE_ENV`. Prefers `RAILWAY_ENVIRONMENT_NAME`, falling back to
 * the legacy `RAILWAY_ENVIRONMENT` (`scripts/postinstall.cjs` confirms the
 * latter is set on Railway).
 */
export const railwayEnvironmentName = (): string | undefined =>
  process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT

/**
 * True only when this deployment is the production Railway environment.
 *
 * Fail-safe: any other / unknown environment name (a `pr-*` preview, staging,
 * local, CI, test) → `false` → the isolation guard stays ACTIVE, protecting
 * production assets. The only failure mode is prod self-isolating if its
 * environment were misnamed — loud (prod can't delete its own assets), never
 * destructive.
 */
export const isProductionDeployment = (): boolean =>
  railwayEnvironmentName() === PRODUCTION_ENVIRONMENT_NAME

/**
 * Whether storage isolation (upload prefixing + delete guard) is active for
 * this deployment. Active everywhere EXCEPT canonical production.
 */
export const isStorageIsolationActive = (): boolean => !isProductionDeployment()

/**
 * Prefix a Cloudflare Images custom ID or R2 object key with the preview marker
 * when isolation is active. No-op in production; idempotent (never
 * double-prefixes a key that is already marked).
 */
export const applyPreviewPrefix = (baseName: string): string => {
  if (!isStorageIsolationActive()) return baseName
  if (baseName.startsWith(PREVIEW_ASSET_PREFIX)) return baseName
  return `${PREVIEW_ASSET_PREFIX}${baseName}`
}

/**
 * Whether an Images custom ID / R2 object key was created by a non-production
 * deployment (i.e. carries the preview marker). The delete guard only permits
 * deleting assets for which this is true.
 */
export const isPreviewOwnedKey = (idOrKey: string): boolean =>
  idOrKey.startsWith(PREVIEW_ASSET_PREFIX)

/**
 * Whether a Cloudflare Stream video's `meta` marks it as preview-owned.
 * Stream UIDs are assigned by Cloudflare, so the marker lives in `meta` rather
 * than the ID.
 */
export const isPreviewOwnedVideoMeta = (meta: Record<string, string> | null | undefined): boolean =>
  meta?.[PREVIEW_STREAM_META_KEY] === PREVIEW_STREAM_META_VALUE

/**
 * Shared non-production delete guard for the storage adapters. Returns `true`
 * (and logs a warning) when this deployment must REFUSE to delete `key` because
 * it isn't preview-owned — protecting cloned production assets.
 *
 * The isolation check short-circuits BEFORE `isPreviewOwned` runs, so:
 *  - production pays nothing (the guard is a no-op), and
 *  - a backend whose ownership check is an API call (Stream reads `meta` via a
 *    GET) never makes that call in production.
 *
 * `isPreviewOwned` is a thunk so the (possibly async, possibly remote) check is
 * deferred until isolation is known to be active. Usage:
 * `if (await shouldRefusePreviewDelete('R2', key, () => isPreviewOwnedKey(key))) return`.
 */
export const shouldRefusePreviewDelete = async (
  backendLabel: string,
  key: string,
  isPreviewOwned: () => boolean | Promise<boolean>,
): Promise<boolean> => {
  if (!isStorageIsolationActive()) return false
  if (await isPreviewOwned()) return false
  storageLogger.warn({
    msg: 'Refusing to delete non-preview asset from a non-production deployment',
    backend: backendLabel,
    key,
  })
  return true
}

/**
 * Whether a stored asset is safe to reap in the scheduled preview cleanup
 * (`scripts/cleanup-preview-assets.ts`).
 *
 * This is the single most safety-critical predicate in the cleanup path — a bug
 * here could delete a production asset — so it is deliberately conservative and
 * pure (no I/O), making it exhaustively unit-testable:
 *  - NEVER reap an asset that is not preview-owned (a production asset).
 *  - NEVER reap an asset of unknown age (`createdAt == null`).
 *  - Only reap preview-owned assets at least `maxAgeDays` old, so an in-flight
 *    preview's freshly-uploaded assets are left alone.
 *
 * @param isPreviewOwned - result of `isPreviewOwnedKey` / `isPreviewOwnedVideoMeta`
 * @param createdAt - the asset's upload/create time (`null` when unknown)
 */
export const isReapablePreviewAsset = (
  isPreviewOwned: boolean,
  createdAt: Date | null,
  now: Date,
  maxAgeDays: number,
): boolean => {
  if (!isPreviewOwned) return false
  if (!createdAt) return false
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  return now.getTime() - createdAt.getTime() >= maxAgeMs
}
