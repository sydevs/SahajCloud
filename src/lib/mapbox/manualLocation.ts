/**
 * Hand-entered locations store a sentinel in `mapboxId` instead of a real Mapbox
 * feature id. Historically that was the bare string `'manual'`, shared by every
 * manual node — which can't coexist with a `unique` constraint. So every manual
 * node now gets a *unique* `manual-<suffix>` value: a random uuid in the admin
 * (`makeManualMapboxId()`), or a stable per-node key in the importer
 * (`makeManualMapboxId(seed)`). The bare legacy `'manual'` is still recognised.
 * Detection is therefore prefix-based.
 */

export const MANUAL_PREFIX = 'manual'

/** True for any hand-entered location id — the bare `'manual'` or a `manual-<suffix>`. */
export const isManualMapboxId = (value: unknown): boolean =>
  typeof value === 'string' && (value === MANUAL_PREFIX || value.startsWith(`${MANUAL_PREFIX}-`))

/**
 * A unique hand-entered location id. Pass a stable `seed` (e.g. a natural key)
 * for a deterministic, idempotent value; omit it for a random uuid.
 */
export const makeManualMapboxId = (seed?: string): string =>
  `${MANUAL_PREFIX}-${seed ?? crypto.randomUUID()}`
