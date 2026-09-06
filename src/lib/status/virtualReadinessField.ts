import type { ComputeFn } from './types'
import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

export const READINESS_REPORT_SCHEMA_URI = 'urn:sahajcloud:schema:readiness-report'

/** `{ total, passing }`, the shape every summary in the report uses. */
const summarySchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  required: ['total', 'passing'],
  properties: { total: { type: 'number' }, passing: { type: 'number' } },
}

/** `CheckResult` — a stable key plus its outcome. */
const checkResultSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'passed'],
  properties: { key: { type: 'string' }, passed: { type: 'boolean' } },
}

/** `GroupCounter` — the "X of Y" header counter. */
const counterSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  required: ['current', 'total'],
  properties: { current: { type: 'number' }, total: { type: 'number' } },
}

/** One row of a `documents` group, or one item of an `aggregate` group. */
const documentReportSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'checks'],
  properties: {
    id: { type: ['integer', 'string'] },
    label: { type: 'string' },
    checks: { type: 'array', items: checkResultSchema },
  },
}

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
export const readinessReportJsonSchema: JSONSchema4 = {
  $id: READINESS_REPORT_SCHEMA_URI,
  title: 'ReadinessReport',
  type: 'object',
  additionalProperties: false,
  required: ['groups', 'summary', 'passing', 'progress'],
  properties: {
    groups: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'key', 'documents', 'summary', 'passing', 'counter'],
            properties: {
              type: { type: 'string', enum: ['documents'] },
              key: { type: 'string' },
              optional: { type: 'boolean' },
              documents: { type: 'array', items: documentReportSchema },
              summary: summarySchema,
              passing: { type: 'boolean' },
              counter: counterSchema,
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'key', 'passed', 'actual', 'threshold', 'passing', 'counter'],
            properties: {
              type: { type: 'string', enum: ['aggregate'] },
              key: { type: 'string' },
              optional: { type: 'boolean' },
              passed: { type: 'boolean' },
              actual: { type: 'number' },
              threshold: { type: 'number' },
              items: { type: 'array', items: documentReportSchema },
              passing: { type: 'boolean' },
              counter: counterSchema,
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'key', 'error', 'passing', 'counter'],
            properties: {
              type: { type: 'string', enum: ['errored'] },
              key: { type: 'string' },
              optional: { type: 'boolean' },
              error: { type: 'string' },
              passing: { type: 'boolean', enum: [false] },
              // Errored groups have no counter.
              counter: { type: 'null' },
            },
          },
        ],
      },
    },
    summary: summarySchema,
    optionalSummary: summarySchema,
    passing: { type: 'boolean' },
    progress: {
      type: 'object',
      additionalProperties: false,
      required: ['passing', 'total'],
      properties: { passing: { type: 'number' }, total: { type: 'number' } },
    },
  },
}

/** The field-level wrapper Payload wants — see `virtualReadinessField`. */
export const readinessReportFieldSchema: JSONField['jsonSchema'] = {
  uri: READINESS_REPORT_SCHEMA_URI,
  fileMatch: [READINESS_REPORT_SCHEMA_URI],
  schema: readinessReportJsonSchema,
}

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
  return {
    // Virtual: written by the hook below, never stored. The schema mirrors
    // `ReadinessReport` in `./types`. See `src/collections/AGENTS.md`.
    name,
    type: 'json',
    virtual: true,
    jsonSchema: readinessReportFieldSchema,
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
