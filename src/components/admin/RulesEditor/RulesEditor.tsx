'use client'

import { Collapsible } from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React, { useCallback, useMemo } from 'react'

import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import type { RuleDefinition, RulesValue, RuleValue } from '@/fields/rulesField'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RulesEditorProps {
  ruleDefinitions: RuleDefinition[]
  value: RulesValue | null
  onChange: (value: RulesValue | null) => void
  readOnly?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse boolean toggle value ('true'|'false'|'') to boolean|undefined.
 * Empty string represents cleared/unset state.
 */
function parseBooleanToggle(value: string): boolean | undefined {
  if (value === '') return undefined
  return value === 'true'
}

/**
 * Convert boolean value to toggle string ('true'|'false'|'').
 * undefined/null becomes empty string for clearable toggle.
 */
function booleanToToggle(value: boolean | undefined | null): string {
  if (value === true) return 'true'
  if (value === false) return 'false'
  return ''
}

/** Remove empty/unset rules and return null if no meaningful rules remain */
function cleanRules(rules: RulesValue): RulesValue | null {
  const cleaned: RulesValue = {}
  let hasRules = false

  for (const [key, val] of Object.entries(rules)) {
    if (key === 'logic') {
      cleaned.logic = val as 'AND' | 'OR'
      continue
    }

    if (typeof val === 'boolean') {
      cleaned[key] = val
      hasRules = true
    } else if (Array.isArray(val)) {
      if (val.length > 0) {
        cleaned[key] = val
        hasRules = true
      }
    } else if (typeof val === 'object' && val !== null) {
      const range = val as { min?: number; max?: number }
      if (range.min !== undefined || range.max !== undefined) {
        cleaned[key] = range
        hasRules = true
      }
    }
  }

  return hasRules ? cleaned : null
}

/** Build a human-readable summary of the current rules for the Collapsible header */
function summarizeRules(
  value: RulesValue | null,
  ruleDefinitions: RuleDefinition[],
): React.ReactNode {
  if (!value) return 'Show to all users (no rules)'

  const parts: string[] = []

  for (const rule of ruleDefinitions) {
    const ruleValue = value[rule.name]
    if (ruleValue === undefined) continue

    if (rule.type === 'boolean' && typeof ruleValue === 'boolean') {
      parts.push(`${rule.name} = ${ruleValue ? 'Yes' : 'No'}`)
    } else if (
      rule.type === 'select' &&
      rule.options &&
      Array.isArray(ruleValue) &&
      ruleValue.length > 0
    ) {
      const labels = ruleValue.map((v) => {
        const opt = rule.options!.find((o) => o.value === v)
        return opt?.label ?? v
      })
      parts.push(`${rule.name} = ${labels.join(', ')}`)
    } else if (rule.type === 'range' && typeof ruleValue === 'object' && ruleValue !== null) {
      const { min, max } = ruleValue as { min?: number; max?: number }
      if (min !== undefined && max !== undefined) {
        parts.push(`${min} ≤ ${rule.name} ≤ ${max}`)
      } else if (min !== undefined) {
        parts.push(`${rule.name} ≥ ${min}`)
      } else if (max !== undefined) {
        parts.push(`${rule.name} ≤ ${max}`)
      }
    }
  }

  if (parts.length === 0) return 'No rules (show to all)'

  const logic = value.logic || 'AND'
  return parts.reduce<React.ReactNode[]>((acc, part, i) => {
    if (i > 0) acc.push(<strong key={`conj-${i}`}> {logic} </strong>)
    acc.push(<span key={`part-${i}`}>{part}</span>)
    return acc
  }, [])
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.6)',
  },
  ruleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--base) * 0.5)',
    '--base': '12px',
  },
  ruleLabelColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.15)',
    minWidth: '180px',
    flexShrink: 0,
  },
  ruleLabel: {
    fontSize: 'calc(var(--base-body-size) * 1px)',
    color: 'var(--theme-elevation-800)',
    fontWeight: 500 as const,
  },
  ruleDescription: {
    fontSize: 'calc(var(--base-body-size) * 0.85px)',
    color: 'var(--theme-elevation-500)',
    fontWeight: 400 as const,
    lineHeight: 1.3,
  },
  rangeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--base) * 0.4)',
  },
  numberInput: {
    width: '100px',
  },
  emptyState: {
    padding: 'calc(var(--base) * 0.5)',
    color: 'var(--theme-elevation-400)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontStyle: 'italic' as const,
  },
}

// ── Range Control ──────────────────────────────────────────────────────────────

function RangeControl({
  value,
  onChange,
  readOnly,
}: {
  value: { min?: number; max?: number } | undefined
  onChange: (value: { min?: number; max?: number } | undefined) => void
  readOnly?: boolean
}) {
  const handleField = (field: 'min' | 'max', raw: string) => {
    const num = raw === '' ? undefined : Number(raw)
    const next = { ...value, [field]: num }
    if (num === undefined) delete next[field]

    // Allow all changes - server-side validation in rulesField.ts handles max > min
    onChange(next.min === undefined && next.max === undefined ? undefined : next)
  }

  return (
    <div style={styles.rangeGroup}>
      <div className="field-type number" style={styles.numberInput}>
        <input
          type="number"
          min={0}
          step={1}
          placeholder="Min"
          value={value?.min ?? ''}
          onChange={(e) => handleField('min', e.target.value)}
          disabled={readOnly}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          aria-label="Minimum value"
        />
      </div>
      <div className="field-type number" style={styles.numberInput}>
        <input
          type="number"
          min={0}
          step={1}
          placeholder="Max"
          value={value?.max ?? ''}
          onChange={(e) => handleField('max', e.target.value)}
          disabled={readOnly}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          aria-label="Maximum value"
        />
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

/**
 * Pure UI component for visual targeting rules editing.
 *
 * Renders an AND/OR toggle and per-rule controls (boolean or range)
 * inside a Collapsible with a human-readable summary header.
 * Rules with unset/empty values are excluded from the output.
 * When all rules are cleared, value becomes null (no targeting = show to all).
 */
export const RulesEditor: React.FC<RulesEditorProps> = ({
  ruleDefinitions,
  value,
  onChange,
  readOnly = false,
}) => {
  const currentLogic = value?.logic || 'AND'

  const handleLogicChange = useCallback(
    (newLogic: string) => {
      if (!value) return
      onChange({ ...value, logic: newLogic as 'AND' | 'OR' })
    },
    [value, onChange],
  )

  const handleRuleChange = useCallback(
    (ruleName: string, ruleValue: RuleValue | undefined) => {
      // Derive logic inside callback to avoid stale closure and ESLint warning
      const logic = value?.logic || 'AND'
      const updated: RulesValue = { ...value, logic }
      if (ruleValue === undefined) {
        delete updated[ruleName]
      } else {
        updated[ruleName] = ruleValue
      }
      onChange(cleanRules(updated))
    },
    [value, onChange],
  )

  const summary = useMemo(
    () => summarizeRules(value, ruleDefinitions),
    [value, ruleDefinitions],
  )

  // Count how many rules are currently specified
  const activeRuleCount = useMemo(() => {
    if (!value) return 0

    let count = 0
    for (const [key, val] of Object.entries(value)) {
      if (key === 'logic') continue

      if (typeof val === 'boolean') {
        count++
      } else if (Array.isArray(val) && val.length > 0) {
        count++
      } else if (typeof val === 'object' && val !== null) {
        const range = val as { min?: number; max?: number }
        if (range.min !== undefined || range.max !== undefined) {
          count++
        }
      }
    }

    return count
  }, [value])

  if (ruleDefinitions.length === 0) {
    return <div style={styles.emptyState}>No rule definitions configured.</div>
  }

  return (
    <Collapsible header={summary} initCollapsed={false}>
      <div style={styles.container}>
        {/* Only show logic toggle when multiple rules are specified */}
        {activeRuleCount >= 2 && (
          <div style={styles.ruleRow}>
            <span style={styles.ruleLabel}>Logic</span>
            <ToggleGroup
              options={[
                { label: 'AND', value: 'AND' },
                { label: 'OR', value: 'OR' },
              ]}
              value={currentLogic}
              onChange={handleLogicChange}
              readOnly={readOnly}
              aria-label="Rule combination logic"
            />
          </div>
        )}

        {ruleDefinitions.map((rule) => {
          const ruleValue = value?.[rule.name]

          return (
            <div key={rule.name} style={styles.ruleRow}>
              <div style={styles.ruleLabelColumn}>
                <span style={styles.ruleLabel}>{toWords(rule.name)}</span>
                {rule.description && (
                  <span style={styles.ruleDescription}>{rule.description}</span>
                )}
              </div>

              {rule.type === 'boolean' ? (
                <ToggleGroup
                  options={[
                    { label: 'Yes', value: 'true' },
                    { label: 'No', value: 'false' },
                  ]}
                  value={booleanToToggle(ruleValue as boolean | undefined)}
                  onChange={(v) => handleRuleChange(rule.name, parseBooleanToggle(v))}
                  clearable
                  readOnly={readOnly}
                  aria-label={`${toWords(rule.name)} rule value`}
                />
              ) : rule.type === 'select' && rule.options ? (
                <ToggleGroup
                  hasMany
                  options={rule.options}
                  value={Array.isArray(ruleValue) ? (ruleValue as string[]) : []}
                  onChange={(v) => {
                    handleRuleChange(rule.name, v.length > 0 ? v : undefined)
                  }}
                  clearable
                  readOnly={readOnly}
                  aria-label={`${toWords(rule.name)} rule value`}
                />
              ) : (
                <RangeControl
                  value={
                    typeof ruleValue === 'object' && ruleValue !== null
                      ? (ruleValue as { min?: number; max?: number })
                      : undefined
                  }
                  onChange={(v) => handleRuleChange(rule.name, v)}
                  readOnly={readOnly}
                />
              )}
            </div>
          )
        })}
      </div>
    </Collapsible>
  )
}

export default RulesEditor
