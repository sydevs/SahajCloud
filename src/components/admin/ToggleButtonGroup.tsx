'use client'

import type { FieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'
import React, { useEffect, useRef } from 'react'

/**
 * Toggle Button Group Component
 *
 * A segmented control (iOS-style) custom field component for PayloadCMS select fields.
 * Renders options as connected buttons with a visual active state.
 *
 * Best Practices:
 * - Recommended for select fields with 1-5 options
 * - Not suitable for long option lists (use standard dropdown instead)
 * - Always maintains a selected value (no deselect capability)
 * - Use for mutually exclusive options with clear visual feedback
 *
 * Usage:
 * ```typescript
 * {
 *   name: 'status',
 *   type: 'select',
 *   required: true,
 *   defaultValue: 'draft',
 *   options: [
 *     { label: 'Draft', value: 'draft' },
 *     { label: 'Published', value: 'published' },
 *   ],
 *   admin: {
 *     components: {
 *       Field: '@/components/admin/ToggleButtonGroup',
 *     },
 *   },
 * }
 * ```
 */
export const ToggleButtonGroup: FieldClientComponent = ({ field, readOnly }) => {
  const { value, setValue} = useField<string>({ path: (field as any).name })
  const containerRef = useRef<HTMLDivElement>(null)

  // Get options from field config
  const options = (field as any).options || []

  // Ensure we always have a value (use default or first option)
  useEffect(() => {
    if (!value && options.length > 0) {
      const defaultValue = (field as any).defaultValue || options[0].value
      setValue(defaultValue as string)
    }
  }, [value, options, field, setValue])

  // Handle button click
  const handleSelect = (optionValue: string) => {
    if (!readOnly && optionValue !== value) {
      setValue(optionValue)
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
      aria-label={(field as any).label || (field as any).name}
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
      {options.map((option: any, index: number) => {
        const isSelected = value === option.value
        const isDisabled = readOnly

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={typeof option.label === 'string' ? option.label : option.value}
            disabled={isDisabled}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => handleSelect(option.value)}
            onKeyDown={(e) => handleKeyDown(e, option.value, index)}
            style={{
              padding: 'calc(var(--base) * 0.4) calc(var(--base) * 0.8)',
              border: 'none',
              borderRight:
                index < options.length - 1 ? '1px solid var(--theme-elevation-200)' : 'none',
              background: isSelected
                ? 'var(--theme-elevation-400)'
                : 'var(--theme-elevation-50)',
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
            {typeof option.label === 'string' ? option.label : option.value}
          </button>
        )
      })}
    </div>
  )
}

export default ToggleButtonGroup
