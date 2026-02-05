'use client'

import { toWords } from 'payload/shared'
import React, { useCallback, useMemo } from 'react'

import { ToggleGroup } from '@/components/admin/ToggleGroupField/ToggleGroup'
import type { RuleDefinition, RulesValue } from '@/fields/rulesField'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RulesEditorProps {
  ruleDefinitions: RuleDefinition[]
  value: RulesValue | null
  onChange: (value: RulesValue | null) => void
  readOnly?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const LOGIC_OPTIONS = [
  { label: 'AND', value: 'AND' },
  { label: 'OR', value: 'OR' },
]

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

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.6)',
  },
  logicRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--base) * 0.5)',
    paddingBottom: 'calc(var(--base) * 0.4)',
    borderBottom: '1px solid var(--theme-elevation-100)',
    marginBottom: 'calc(var(--base) * 0.2)',
  },
  logicLabel: {
    fontSize: 'calc(var(--base-body-size) * 1px)',
    color: 'var(--theme-elevation-600)',
    fontWeight: 500 as const,
    minWidth: '50px',
  },
  ruleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--base) * 0.5)',
    padding: 'calc(var(--base) * 0.3) 0',
  },
  ruleLabel: {
    fontSize: 'calc(var(--base-body-size) * 1px)',
    color: 'var(--theme-elevation-800)',
    fontWeight: 500 as const,
    minWidth: '160px',
    flexShrink: 0,
  },
  rangeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--base) * 0.4)',
  },
  rangeLabel: {
    fontSize: 'calc(var(--base-body-size) * 0.9px)',
    color: 'var(--theme-elevation-500)',
  },
  rangeInput: {
    width: '80px',
    padding: 'calc(var(--base) * 0.2) calc(var(--base) * 0.4)',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 'var(--style-radius-s)',
    backgroundColor: 'var(--theme-input-bg)',
    color: 'var(--theme-elevation-800)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
  },
  emptyState: {
    padding: 'calc(var(--base) * 0.5)',
    color: 'var(--theme-elevation-400)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontStyle: 'italic' as const,
  },
}

// ── Boolean Control ────────────────────────────────────────────────────────────

const BOOLEAN_OPTIONS = [
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
  { label: '—', value: 'unset' },
]

function BooleanControl({
  value,
  onChange,
  readOnly,
}: {
  value: boolean | undefined
  onChange: (value: boolean | undefined) => void
  readOnly?: boolean
}) {
  const currentValue = value === true ? 'true' : value === false ? 'false' : 'unset'

  const handleChange = (selected: string) => {
    if (selected === 'true') onChange(true)
    else if (selected === 'false') onChange(false)
    else onChange(undefined)
  }

  return (
    <ToggleGroup
      options={BOOLEAN_OPTIONS}
      value={currentValue}
      onChange={handleChange}
      readOnly={readOnly}
      aria-label="Boolean rule value"
    />
  )
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
  const handleMin = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const min = raw === '' ? undefined : Number(raw)
    const next = { ...value, min }
    if (next.min === undefined) delete next.min
    if (next.min === undefined && next.max === undefined) {
      onChange(undefined)
    } else {
      onChange(next)
    }
  }

  const handleMax = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const max = raw === '' ? undefined : Number(raw)
    const next = { ...value, max }
    if (next.max === undefined) delete next.max
    if (next.min === undefined && next.max === undefined) {
      onChange(undefined)
    } else {
      onChange(next)
    }
  }

  return (
    <div style={styles.rangeGroup}>
      <span style={styles.rangeLabel}>Min</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value?.min ?? ''}
        onChange={handleMin}
        disabled={readOnly}
        style={styles.rangeInput}
        aria-label="Minimum value"
      />
      <span style={styles.rangeLabel}>Max</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value?.max ?? ''}
        onChange={handleMax}
        disabled={readOnly}
        style={styles.rangeInput}
        aria-label="Maximum value"
      />
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

/**
 * Pure UI component for visual targeting rules editing.
 *
 * Renders an AND/OR toggle and per-rule controls (boolean or range).
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

  // Derive labels from field names
  const labels = useMemo(
    () =>
      ruleDefinitions.reduce<Record<string, string>>((acc, rule) => {
        acc[rule.name] = toWords(rule.name)
        return acc
      }, {}),
    [ruleDefinitions],
  )

  const handleLogicChange = useCallback(
    (newLogic: string) => {
      const updated: RulesValue = { ...value, logic: newLogic as 'AND' | 'OR' }
      onChange(cleanRules(updated))
    },
    [value, onChange],
  )

  const handleRuleChange = useCallback(
    (ruleName: string, ruleValue: boolean | { min?: number; max?: number } | undefined) => {
      const updated: RulesValue = { ...value, logic: currentLogic }
      if (ruleValue === undefined) {
        delete updated[ruleName]
      } else {
        updated[ruleName] = ruleValue
      }
      onChange(cleanRules(updated))
    },
    [value, currentLogic, onChange],
  )

  if (ruleDefinitions.length === 0) {
    return <div style={styles.emptyState}>No rule definitions configured.</div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.logicRow}>
        <span style={styles.logicLabel}>Logic</span>
        <ToggleGroup
          options={LOGIC_OPTIONS}
          value={currentLogic}
          onChange={handleLogicChange}
          readOnly={readOnly}
          aria-label="Rule combination logic"
        />
      </div>

      {ruleDefinitions.map((rule) => {
        const ruleValue = value?.[rule.name]

        return (
          <div key={rule.name} style={styles.ruleRow}>
            <span style={styles.ruleLabel}>{labels[rule.name]}</span>

            {rule.type === 'boolean' ? (
              <BooleanControl
                value={typeof ruleValue === 'boolean' ? ruleValue : undefined}
                onChange={(v) => handleRuleChange(rule.name, v)}
                readOnly={readOnly}
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
  )
}

export default RulesEditor
