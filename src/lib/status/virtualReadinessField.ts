import type { ComputeFn } from './types'
import type { JSONField } from 'payload'

/**
 * Build a per-section virtual JSON field that computes a `ReadinessReport`
 * via `afterRead` on every read.
 *
 * The factory hides the recurring plumbing:
 * - returns `null` when `req.locale === 'all'` so the field never
 *   triggers a per-locale fan-out within a single read (callers iterate
 *   locales explicitly);
 * - extracts the per-project config from the `data` arg (the global's
 *   own document) instead of issuing a recursive `findGlobal`, which
 *   would re-enter this hook chain;
 * - delegates the real work to the supplied `compute` function.
 *
 * Generic on `TConfig` — each project's status global defines its own
 * config shape and `extractConfig` extractor.
 */
export function virtualReadinessField<TConfig>(
  name: string,
  compute: ComputeFn<TConfig>,
  extractConfig: (data: unknown) => TConfig,
): JSONField {
  return {
    name,
    type: 'json',
    virtual: true,
    localized: true,
    admin: {
      readOnly: true,
      description: `Computed launch-readiness report for the ${name} section in the current locale.`,
    },
    hooks: {
      afterRead: [
        async ({ data, req }) => {
          const locale = req.locale
          if (!locale || locale === 'all') return null
          const config = extractConfig(data)
          return compute(req.payload, locale, config, req)
        },
      ],
    },
  }
}
