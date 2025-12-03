'use client'

import React, { useRef } from 'react'

export interface ToggleButtonOption {
  label: string
  value: string
}

export interface ToggleButtonGroupProps {
  value: string
  onChange: (value: string) => void
  options: ToggleButtonOption[]
  readOnly?: boolean
  'aria-label'?: string
}

/**
 * Toggle Button Group Component
 *
 * A pure UI component that renders a segmented control (iOS-style) with connected buttons.
 * Works with 1-5 options, displays them as connected buttons in a horizontal row.
 * Selected state is highlighted with primary color and shadow effect.
 *
 * Features:
 * - Keyboard navigation (arrow keys)
 * - Read-only support
 * - Accessible with ARIA labels and roles
 * - Responsive styling using PayloadCMS theme variables
 *
 * This is a controlled component - parent must manage value state.
 *
 * @example
 * ```tsx
 * <ToggleButtonGroup
 *   value={selectedValue}
 *   onChange={setSelectedValue}
 *   options={[
 *     { label: 'Draft', value: 'draft' },
 *     { label: 'Published', value: 'published' },
 *   ]}
 * />
 * ```
 */
export const ToggleButtonGroup: React.FC<ToggleButtonGroupProps> = ({
  value,
  onChange,
  options,
  readOnly = false,
  'aria-label': ariaLabel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle button click
  const handleSelect = (optionValue: string) => {
    if (!readOnly && optionValue !== value) {
      onChange(optionValue)
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

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        gap: '0',
        width: 'fit-content',
        border: '1px solid var(--theme-elevation-200)',
        borderRadius: 'var(--style-radius-s)',
        overflow: 'hidden',
        backgroundColor: 'var(--theme-elevation-50)',
      }}
    >
      {options.map((option, index) => {
        const isSelected = value === option.value
        const isDisabled = readOnly

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={option.label}
            disabled={isDisabled}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => handleSelect(option.value)}
            onKeyDown={(e) => handleKeyDown(e, option.value, index)}
            style={{
              padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.8)',
              border: 'none',
              borderRight:
                index < options.length - 1 ? '1px solid var(--theme-elevation-200)' : 'none',
              background: isSelected ? 'var(--theme-elevation-400)' : 'var(--theme-elevation-50)',
              color: isSelected ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-800)',
              fontSize: 'calc(var(--base-body-size) * 1px)',
              fontWeight: isSelected ? 600 : 400,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              outline: 'none',
              whiteSpace: 'nowrap',
              minWidth: '80px',
              opacity: isDisabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isDisabled && !isSelected) {
                e.currentTarget.style.backgroundColor = 'var(--theme-elevation-100)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isDisabled && !isSelected) {
                e.currentTarget.style.backgroundColor = 'var(--theme-elevation-50)'
              }
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = 'inset 0 0 0 2px var(--theme-elevation-500)'
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
  )
}

export default ToggleButtonGroup
