'use client'

import { Button } from '@payloadcms/ui'
import React, { useRef } from 'react'

export interface ToggleGroupOption {
  label: string
  value: string
}

interface SingleSelectProps {
  hasMany?: false
  value: string
  onChange: (value: string) => void
}

interface MultiSelectProps {
  hasMany: true
  value: string[]
  onChange: (value: string[]) => void
}

export type ToggleGroupProps = (SingleSelectProps | MultiSelectProps) & {
  options: ToggleGroupOption[]
  readOnly?: boolean
  clearable?: boolean
  'aria-label'?: string
}

/**
 * Toggle Button Group Component
 *
 * A pure UI component with two visually distinct modes:
 * - Single-select: connected segmented control (iOS-style) — buttons joined in a row
 * - Multi-select: separated pill-shaped buttons with gaps — each button looks independent
 *
 * Features:
 * - Single-select mode (default): radio behavior, connected buttons, one selected at a time
 * - Multi-select mode (`hasMany: true`): checkbox behavior, separated pill buttons, toggle on/off
 * - Keyboard navigation (arrow keys)
 * - Read-only support
 * - Accessible with ARIA labels and roles
 * - Responsive styling using PayloadCMS theme variables
 *
 * This is a controlled component - parent must manage value state.
 *
 * @example Single-select
 * ```tsx
 * <ToggleGroup
 *   value={selectedValue}
 *   onChange={setSelectedValue}
 *   options={[
 *     { label: 'Draft', value: 'draft' },
 *     { label: 'Published', value: 'published' },
 *   ]}
 * />
 * ```
 *
 * @example Multi-select
 * ```tsx
 * <ToggleGroup
 *   hasMany
 *   value={selectedValues}
 *   onChange={setSelectedValues}
 *   options={[
 *     { label: 'Morning', value: 'morning' },
 *     { label: 'Evening', value: 'evening' },
 *   ]}
 * />
 * ```
 */
export const ToggleGroup: React.FC<ToggleGroupProps> = (props) => {
  const { options, readOnly = false, clearable = false, 'aria-label': ariaLabel } = props
  const isMulti = props.hasMany === true
  const containerRef = useRef<HTMLDivElement>(null)

  // Check if an option is selected
  const isOptionSelected = (optionValue: string): boolean => {
    if (isMulti) {
      return (props.value as string[]).includes(optionValue)
    }
    return (props.value as string) === optionValue
  }

  // Handle button click
  const handleSelect = (optionValue: string) => {
    if (readOnly) return

    if (isMulti) {
      const currentValues = props.value as string[]
      const onChange = props.onChange as (value: string[]) => void
      if (currentValues.includes(optionValue)) {
        onChange(currentValues.filter((v) => v !== optionValue))
      } else {
        onChange([...currentValues, optionValue])
      }
    } else {
      const onChange = props.onChange as (value: string) => void
      if (clearable && optionValue === (props.value as string)) {
        // Deselect if clearable and clicking on currently selected value
        onChange('')
      } else if (optionValue !== (props.value as string)) {
        onChange(optionValue)
      }
    }
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, optionValue: string, index: number) => {
    if (readOnly) return

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSelect(optionValue)
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      const prevButton = containerRef.current?.children[index - 1] as HTMLButtonElement
      prevButton?.focus()
    } else if (e.key === 'ArrowRight' && index < options.length - 1) {
      e.preventDefault()
      const nextButton = containerRef.current?.children[index + 1] as HTMLButtonElement
      nextButton?.focus()
    }
  }

  // Determine if clear button should be shown
  const hasValue = isMulti ? (props.value as string[]).length > 0 : Boolean(props.value)
  const showClearButton = clearable && !readOnly && hasValue

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(var(--base) * 0.3)',
        width: 'fit-content',
      }}
    >
      <div
        ref={containerRef}
        role={isMulti ? 'group' : 'radiogroup'}
        aria-label={ariaLabel}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: 'fit-content',
          ...(isMulti
            ? {
                gap: 'calc(var(--base) * 0.3)',
              }
            : {
                border: '1px solid var(--theme-elevation-200)',
                borderRadius: 'var(--style-radius-s)',
                overflow: 'hidden',
                backgroundColor: 'var(--theme-elevation-0)',
              }),
        }}
      >
        {options.map((option, index) => {
          const isSelected = isOptionSelected(option.value)
          const isDisabled = readOnly

          return (
            <button
              key={option.value}
              type="button"
              role={isMulti ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              aria-label={option.label}
              disabled={isDisabled}
              tabIndex={isMulti || isSelected ? 0 : -1}
              onClick={() => handleSelect(option.value)}
              onKeyDown={(e) => handleKeyDown(e, option.value, index)}
              style={{
                padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.8)',
                background: isSelected ? 'var(--theme-success-500)' : 'transparent',
                color: isSelected ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-800)',
                fontSize: 'calc(var(--base-body-size) * 1px)',
                fontWeight: isSelected ? 600 : 400,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
                outline: 'none',
                whiteSpace: 'nowrap',
                opacity: isDisabled ? 0.5 : 1,
                ...(isMulti
                  ? {
                      border: '1px solid var(--theme-elevation-200)',
                      borderRadius: 'var(--style-radius-s)',
                    }
                  : {
                      border: 'none',
                      borderRight:
                        index < options.length - 1
                          ? '1px solid var(--theme-elevation-200)'
                          : 'none',
                      minWidth: '120px',
                    }),
              }}
              onMouseEnter={(e) => {
                if (!isDisabled && !isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--theme-elevation-100)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isDisabled && !isSelected) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--theme-success-300)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {showClearButton && (
        <div
          style={
            {
              display: 'flex',
              alignItems: 'center',
              marginLeft: 'calc(var(--base) * 0.3)',
              marginBlock: 'calc(var(--base) * -1)',
              '--base': 1, // Use this to reset the size of the button
            } as React.CSSProperties
          }
        >
          <Button
            buttonStyle="icon-label"
            icon="x"
            onClick={() =>
              isMulti
                ? (props.onChange as (value: string[]) => void)([])
                : (props.onChange as (value: string) => void)('')
            }
            round
            aria-label="Clear selection"
          />
        </div>
      )}
    </div>
  )
}

export default ToggleGroup
