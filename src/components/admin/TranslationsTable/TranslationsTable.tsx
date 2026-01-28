'use client'

import React, { useCallback, useState } from 'react'

export interface TranslationEntry {
  key: string
  description: string
  englishValue?: string
}

export interface TranslationsTableProps {
  entries: TranslationEntry[]
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
  readOnly?: boolean
  isEnglish: boolean
}

const tableStyles: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 'calc(var(--base) * 0.5)',
}

const headerCellStyles: React.CSSProperties = {
  padding: 'calc(var(--base) * 0.5)',
  borderBottom: '2px solid var(--theme-elevation-150)',
  textAlign: 'left',
  fontSize: 'calc(var(--base-body-size) * 1px)',
  fontWeight: 600,
  color: 'var(--theme-elevation-800)',
}

const cellStyles: React.CSSProperties = {
  padding: 'calc(var(--base) * 0.4)',
  borderBottom: '1px solid var(--theme-elevation-100)',
  verticalAlign: 'middle',
}

const keyCellStyles: React.CSSProperties = {
  ...cellStyles,
  width: '40%',
  fontSize: 'calc(var(--base-body-size) * 1px)',
  color: 'var(--theme-elevation-600)',
  fontFamily: 'var(--font-mono)',
}

const inputCellStyles: React.CSSProperties = {
  ...cellStyles,
  width: '60%',
  position: 'relative',
}

const inputStyles: React.CSSProperties = {
  width: '100%',
  padding: 'calc(var(--base) * 0.4)',
  background: 'var(--theme-input-bg)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-s)',
  color: 'var(--theme-text)',
  fontSize: 'calc(var(--base-body-size) * 1px)',
  fontFamily: 'inherit',
}

const inputReadOnlyStyles: React.CSSProperties = {
  ...inputStyles,
  background: 'var(--theme-elevation-50)',
  cursor: 'not-allowed',
}

const tooltipStyles: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: 0,
  right: 0,
  marginBottom: 'calc(var(--base) * 0.25)',
  padding: 'calc(var(--base) * 0.4)',
  background: 'var(--theme-elevation-900)',
  color: 'var(--theme-elevation-100)',
  fontSize: 'calc(var(--base-body-size) * 0.9px)',
  borderRadius: 'var(--style-radius-s)',
  zIndex: 10,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
}

export const TranslationsTable: React.FC<TranslationsTableProps> = ({
  entries,
  value,
  onChange,
  readOnly = false,
  isEnglish,
}) => {
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  const handleChange = useCallback(
    (key: string, newValue: string) => {
      onChange({
        ...value,
        [key]: newValue,
      })
    },
    [value, onChange],
  )

  const handleFocus = useCallback((key: string) => {
    setFocusedKey(key)
  }, [])

  const handleBlur = useCallback(() => {
    setFocusedKey(null)
  }, [])

  return (
    <table style={tableStyles}>
      <thead>
        <tr>
          <th style={headerCellStyles}>{isEnglish ? 'Key' : 'English Value'}</th>
          <th style={headerCellStyles}>Translation</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const displayLabel = isEnglish ? entry.key : (entry.englishValue || entry.key)
          const currentValue = value?.[entry.key] || ''
          const isFocused = focusedKey === entry.key

          return (
            <tr key={entry.key}>
              <td style={keyCellStyles}>{displayLabel}</td>
              <td style={inputCellStyles}>
                {isFocused && entry.description && (
                  <div style={tooltipStyles}>{entry.description}</div>
                )}
                <input
                  type="text"
                  value={currentValue}
                  onChange={(e) => handleChange(entry.key, e.target.value)}
                  onFocus={() => handleFocus(entry.key)}
                  onBlur={handleBlur}
                  style={readOnly ? inputReadOnlyStyles : inputStyles}
                  disabled={readOnly}
                  placeholder={isEnglish ? 'Enter translation...' : entry.englishValue || 'Enter translation...'}
                  aria-label={`Translation for ${entry.key}`}
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
