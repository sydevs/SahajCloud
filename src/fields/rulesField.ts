import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

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

/**
 * Creates a JSON field with a custom visual editor for targeting rules.
 *
 * Rules are stored as a JSON blob, making the system extensible without schema changes.
 * The RulesEditor component provides a visual editing experience with AND/OR logic,
 * boolean toggles, and range inputs.
 *
 * @example
 * rulesField({
 *   rules: [
 *     { name: 'hasRealization', type: 'boolean' },
 *     { name: 'pathProgress', type: 'range' },
 *   ],
 * })
 */
export function rulesField(options: RulesFieldOptions): JSONField {
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
        admin.description || 'Configure which users see this card. Leave empty to show to all users.',
      condition: admin.condition,
    },
  }
}
