import type { ComputeFn } from './types'
import type { JSONField } from 'payload'

import { z } from 'zod'

import { jsonField } from '@/fields/jsonField'

/** `{ total, passing }`, the shape every summary in the report uses. */
const summarySchema = z.strictObject({ total: z.number(), passing: z.number() })

/** `CheckResult` — a stable key plus its outcome. */
const checkResultSchema = z.strictObject({ key: z.string(), passed: z.boolean() })

/** `GroupCounter` — the "X of Y" header counter. */
const counterSchema = z.strictObject({ current: z.number(), total: z.number() })

/** One row of a `documents` group, or one item of an `aggregate` group. */
const documentReportSchema = z.strictObject({
  id: z.union([z.int(), z.string()]),
  label: z.string(),
  checks: z.array(checkResultSchema),
})

/**
 * The JSON-Schema twin of `ReadinessReport` in `./types`.
 *
 * `ReadinessGroup` is a union discriminated by `type`, so the groups are
 * written as `oneOf` — that keeps the discriminator in the generated type,
 * where a single object with optional keys would lose it.
 *
 * Closed throughout because the field's own `afterRead` hook is the only
 * writer and the column is virtual — nothing stores it, so no row exists
 * under an earlier shape. `readiness-field.spec.ts` pins the two definitions
 * to each other.
 */
const readinessReportZodSchema = z.strictObject({
  groups: z.array(
    z.union([
      z.strictObject({
        type: z.literal('documents'),
        key: z.string(),
        optional: z.boolean().optional(),
        documents: z.array(documentReportSchema),
        summary: summarySchema,
        passing: z.boolean(),
        counter: counterSchema,
      }),
      z.strictObject({
        type: z.literal('aggregate'),
        key: z.string(),
        optional: z.boolean().optional(),
        passed: z.boolean(),
        actual: z.number(),
        threshold: z.number(),
        items: z.array(documentReportSchema).optional(),
        passing: z.boolean(),
        counter: counterSchema,
      }),
      z.strictObject({
        type: z.literal('errored'),
        key: z.string(),
        optional: z.boolean().optional(),
        error: z.string(),
        passing: z.literal(false),
        // Errored groups have no counter.
        counter: z.null(),
      }),
    ]),
  ),
  summary: summarySchema,
  optionalSummary: summarySchema.optional(),
  passing: z.boolean(),
  progress: z.strictObject({ passing: z.number(), total: z.number() }),
})

export interface ReadinessFieldAdminCustom {
  sectionMetadata: {
    key: string
    index: number
    label: string
    description: string
    tutorialLink: string | null
  }
  groupsMetadata: Record<
    string,
    {
      label: string
      description: string
      rowDisplay?: 'all' | 'summarize-excess' | 'collapse-passing'
    }
  >
  checksMetadata: Record<string, { label: string; description: string }>
  groupKeyToCollection: Record<string, string | null>
  groupKeyToGlobal: Record<string, string | null>
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
  return jsonField({
    // Virtual: written by the hook below, never stored. The schema mirrors
    // `ReadinessReport` in `./types`. See `src/collections/AGENTS.md`.
    name,
    virtual: true,
    // Named above rather than written out here: a three-branch group union
    // nested in a report is past what a reader can take in beside a field.
    schemaTitle: 'ReadinessReport',
    schema: readinessReportZodSchema,
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
  })
}
