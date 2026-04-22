import type { JSONSchema4 } from 'json-schema'
import type { CheckboxField, Field, FieldHook, JSONField, PayloadRequest } from 'payload'

import { z } from 'zod'

// ── Types ──────────────────────────────────────────────────────────────────────

export type RuleType = 'boolean' | 'range' | 'select'

export interface RuleDefinition {
  /** Key in the JSON object (e.g., 'pathProgress') */
  name: string
  /** 'boolean' = true/false (clearable), 'range' = min/max numbers, 'select' = multi-choice */
  type: RuleType
  /** Options for 'select' type rules (label/value pairs) */
  options?: Array<{ label: string; value: string }>
}

/** Individual rule value types */
export type RuleValue = boolean | { min?: number; max?: number } | string[]

/** Stored JSON shape for targeting rules */
export type RulesValue = {
  logic?: 'AND' | 'OR'
  [key: string]: RuleValue | 'AND' | 'OR' | undefined
}

/** Caller-supplied values keyed by rule name (e.g., `{ pathProgress: 3, totalMeditationsViewed: 12 }`). */
export type AudienceData = Record<string, unknown>

export interface RulesFieldOptions {
  /** Field name (default: 'rules') */
  name?: string
  /** Field label (default: 'Targeting Rules') */
  label?: string
  /** Available rule definitions */
  rules: RuleDefinition[]
  admin?: {
    condition?: (...args: unknown[]) => boolean
    description?: string
  }
}

// ── Request-context key ────────────────────────────────────────────────────────

/**
 * Top-level `req.context` key that endpoints set before calling `payload.find`
 * so the rule-matcher virtual field can evaluate against caller inputs.
 *
 * If two rule fields ever coexist on the same document with conflicting input
 * needs, switch to a scoped shape like `{ [fieldName]: AudienceData }`.
 */
export const AUDIENCE_DATA_CONTEXT_KEY = 'audienceData' as const

/**
 * Returns a shallow-cloned req with `audienceData` stashed on `req.context` so
 * the virtual `isEligibleForAudience` field can evaluate against it during
 * `payload.find` calls. Used by the for-audience endpoints.
 */
export function withAudienceContext(
  req: PayloadRequest,
  audienceData: AudienceData,
): PayloadRequest {
  return {
    ...req,
    context: { ...req.context, [AUDIENCE_DATA_CONTEXT_KEY]: audienceData },
  } as PayloadRequest
}

/**
 * Build the Zod shape dict for query-param audience data from rule definitions.
 * Each rule dimension becomes an optional coerced value matching its type:
 *
 *   - `range`   → `z.coerce.number().optional()` (caller sends a single number)
 *   - `boolean` → `z.enum(['true', 'false']).optional().transform(...)`
 *   - `select`  → `z.string().optional()`
 *
 * Returns the raw shape (not a `z.object(...)`) so consumers can spread it
 * into their own schema alongside endpoint-specific fields:
 *
 *   const querySchema = z.object({
 *     ...buildAudienceDataShape(AUDIENCE_DEFINITIONS),
 *     limit: z.coerce.number().int().min(1).max(20),
 *   })
 *
 * This preserves TS inference for the endpoint-specific fields, which
 * wrapping as `z.object(...).extend(...)` does not when the inner shape
 * is runtime-derived.
 */
export function buildAudienceDataShape(rules: RuleDefinition[]): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const rule of rules) {
    if (rule.type === 'range') {
      shape[rule.name] = z.coerce.number().optional()
    } else if (rule.type === 'boolean') {
      shape[rule.name] = z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === 'true'))
    } else if (rule.type === 'select') {
      shape[rule.name] = z.string().optional()
    }
  }
  return shape
}

// ── Evaluation ─────────────────────────────────────────────────────────────────

function evaluateBoolean(stored: boolean, supplied: unknown): boolean {
  return typeof supplied === 'boolean' && supplied === stored
}

function evaluateRange(stored: { min?: number; max?: number }, supplied: unknown): boolean {
  if (typeof supplied !== 'number' || !Number.isFinite(supplied)) return false
  const min = stored.min ?? Number.NEGATIVE_INFINITY
  const max = stored.max ?? Number.POSITIVE_INFINITY
  return supplied >= min && supplied <= max
}

function evaluateSelect(stored: string[], supplied: unknown): boolean {
  if (!Array.isArray(stored) || stored.length === 0) return true
  if (typeof supplied === 'string') return stored.includes(supplied)
  if (Array.isArray(supplied)) return supplied.some((v) => stored.includes(v as string))
  return false
}

/**
 * Evaluate whether a card's stored targeting rules match the caller's inputs.
 *
 * Contract:
 *   - Empty / missing rules → always match
 *   - `logic` defaults to `'AND'`; `'OR'` needs only one configured rule to match
 *   - Missing caller param → the rule for that key fails (does not match)
 *   - Boolean rule matches when `supplied === stored`
 *   - Range `{min?, max?}` matches when `min <= supplied <= max` (undefined bounds
 *     treated as ±Infinity)
 *   - Select matches when any supplied value is in the stored list
 *   - Unknown / unsupported rule types are ignored (neither pass nor fail)
 */
export function evaluateRules(
  rules: RulesValue | null | undefined,
  inputs: AudienceData,
  definitions: RuleDefinition[],
): boolean {
  if (!rules) return true

  const logic = rules.logic === 'OR' ? 'OR' : 'AND'
  const results: boolean[] = []

  for (const def of definitions) {
    const stored = rules[def.name]
    if (stored === undefined) continue

    const supplied = inputs[def.name]

    if (def.type === 'boolean' && typeof stored === 'boolean') {
      results.push(evaluateBoolean(stored, supplied))
    } else if (def.type === 'range' && typeof stored === 'object' && stored !== null) {
      results.push(evaluateRange(stored as { min?: number; max?: number }, supplied))
    } else if (def.type === 'select' && Array.isArray(stored)) {
      results.push(evaluateSelect(stored as string[], supplied))
    }
  }

  if (results.length === 0) return true
  return logic === 'AND' ? results.every(Boolean) : results.some(Boolean)
}

// ── JSON Schema Generation ─────────────────────────────────────────────────────

/**
 * Generate a JSON Schema from rule definitions for server-side AJV validation.
 * PayloadCMS validates JSON fields against this schema automatically.
 */
export function generateRulesJsonSchema(rules: RuleDefinition[]): JSONSchema4 {
  const properties: Record<string, JSONSchema4> = {
    logic: { type: 'string', enum: ['AND', 'OR'] },
  }

  for (const rule of rules) {
    if (rule.type === 'boolean') {
      properties[rule.name] = { type: 'boolean' }
    } else if (rule.type === 'range') {
      properties[rule.name] = {
        type: 'object',
        properties: {
          min: { type: 'number', minimum: 0 },
          max: { type: 'number', minimum: 0 },
        },
        additionalProperties: false,
      }
    } else if (rule.type === 'select' && rule.options) {
      properties[rule.name] = {
        type: 'array',
        items: { type: 'string', enum: rule.options.map((o) => o.value) },
        uniqueItems: true,
      }
    }
  }

  return {
    type: 'object',
    properties,
    additionalProperties: false,
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate that range rules have max > min when both are defined.
 * Returns error message if invalid, true if valid.
 */
function validateRangeRules(
  value: RulesValue | null | undefined,
  rules: RuleDefinition[],
): string | true {
  if (!value) return true

  for (const rule of rules) {
    if (rule.type !== 'range') continue

    const ruleValue = value[rule.name]
    if (typeof ruleValue !== 'object' || ruleValue === null) continue

    const { min, max } = ruleValue as { min?: number; max?: number }
    if (min !== undefined && max !== undefined && max <= min) {
      return `${rule.name}: max must be greater than min`
    }
  }

  return true
}

// ── Field Factory ──────────────────────────────────────────────────────────────

function buildJsonField(options: RulesFieldOptions): JSONField {
  const { name = 'rules', label = 'Targeting Rules', rules, admin = {} } = options

  return {
    name,
    type: 'json',
    label,
    jsonSchema: {
      uri: `a://${name}.json`,
      fileMatch: [`a://${name}.json`],
      schema: generateRulesJsonSchema(rules),
    },
    validate: (value) => validateRangeRules(value as RulesValue | null | undefined, rules),
    admin: {
      components: {
        Field: '@/components/admin/RulesEditor',
      },
      custom: {
        ruleDefinitions: rules,
      },
      description:
        admin.description ||
        'Configure which users see this card. Leave empty to show to all users.',
      condition: admin.condition,
    },
  }
}

/**
 * Virtual checkbox field that evaluates the sibling rules JSON against caller
 * inputs stashed on `req.context[AUDIENCE_DATA_CONTEXT_KEY]`.
 *
 * Returns `null` when no inputs are present (no evaluation requested), so
 * near-zero overhead for admin UI reads and unrelated fetches.
 */
function buildEligibilityField(options: RulesFieldOptions): CheckboxField {
  const { name = 'rules', rules } = options

  const afterRead: FieldHook = ({ req, siblingData }) => {
    const inputs = req?.context?.[AUDIENCE_DATA_CONTEXT_KEY] as AudienceData | undefined
    if (!inputs) return null
    const stored = (siblingData as Record<string, unknown> | undefined)?.[name] as
      | RulesValue
      | null
      | undefined
    return evaluateRules(stored, inputs, rules)
  }

  return {
    name: 'isEligibleForAudience',
    type: 'checkbox',
    virtual: true,
    admin: { hidden: true },
    hooks: { afterRead: [afterRead] },
  }
}

/**
 * Creates a JSON field with a custom visual editor for targeting rules, plus
 * a virtual `isEligibleForAudience` sibling whose `afterRead` hook evaluates
 * the document's stored rules against `req.context.audienceData`. Endpoints
 * set the context once and filter results by the virtual field instead of
 * importing rule-evaluation logic.
 *
 * Rules are stored as a JSON blob, making the system extensible without
 * schema changes. The RulesEditor component provides a visual editing
 * experience with AND/OR logic, boolean toggles, and range inputs.
 *
 * Returns a `Field[]` — consumers should spread the result into their field list.
 *
 * @example
 * ...rulesField({
 *   rules: [
 *     { name: 'pathProgress', type: 'range' },
 *     { name: 'totalMeditationsViewed', type: 'range' },
 *   ],
 * }),
 */
export function rulesField(options: RulesFieldOptions): Field[] {
  return [buildJsonField(options), buildEligibilityField(options)]
}
