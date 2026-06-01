import type { ComputeFn } from './types'
import type { JSONField } from 'payload'

export interface ReadinessFieldAdminCustom {
  sectionMetadata: {
    key: string
    index: number
    label: string
    description: string
    tutorialLink: string | null
  }
  groupsMetadata: Record<string, { label: string; description: string }>
  checksMetadata: Record<string, { label: string; description: string }>
  groupKeyToCollection: Record<string, string | null>
  configFallback: { type: 'global'; slug: string } | null
}

/**
 * Path that PayloadCMS resolves through the import map; component lives at
 * src/components/admin/ReadinessField/index.ts.
 */
export const READINESS_FIELD_COMPONENT_PATH = '@/components/admin/ReadinessField'

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
 * - delegates the real work to the supplied `compute` function;
 * - registers the `ReadinessField` admin component and attaches the
 *   section's display metadata via `admin.custom`.
 *
 * Generic on `TConfig` — each project's status global defines its own
 * config shape and `extractConfig` extractor.
 */
export function virtualReadinessField<TConfig>(
  name: string,
  compute: ComputeFn<TConfig>,
  extractConfig: (data: unknown) => TConfig,
  adminCustom: ReadinessFieldAdminCustom,
): JSONField {
  return {
    name,
    type: 'json',
    virtual: true,
    localized: true,
    // The custom component renders the section header inline. Hiding the
    // default field label keeps Payload from rendering a duplicate title
    // above each Collapsible.
    label: false,
    admin: {
      readOnly: true,
      description: `Computed launch-readiness report for the ${name} section in the current locale.`,
      components: {
        Field: READINESS_FIELD_COMPONENT_PATH,
      },
      custom: adminCustom as unknown as Record<string, unknown>,
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
