'use client'

import React from 'react'

/**
 * Tag option structure for TagSelector
 */
export interface TagOption {
  id: string | number
  title: string
  url?: string
  color?: string
}

export interface TagSelectorProps {
  value: (string | number)[]
  onChange: (value: (string | number)[]) => void
  options: TagOption[]
  hasMany?: boolean
  readOnly?: boolean
  'aria-label'?: string
}

/**
 * Tag Selector Component
 *
 * A pure UI component that displays tags as icon buttons in a grid layout.
 * Works with any number of tag options, displays them as circular buttons.
 * Selected state is highlighted with tag's color (if available) or success color.
 *
 * Features:
 * - Visual icon-based tag selection
 * - Support for optional tag colors (uses success color if no color defined)
 * - Multi-select support via hasMany prop
 * - Keyboard navigation and accessibility
 * - Responsive grid layout with flex-wrap
 *
 * Selection states:
 * - Unselected: White/neutral background, original SVG colors
 * - Selected with color: Tag's color as background, white SVG (via CSS filter)
 * - Selected without color: Success color background, white SVG
 *
 * This is a controlled component - parent must manage value state.
 *
 * @example
 * ```tsx
 * <TagSelector
 *   value={selectedTagIds}
 *   onChange={setSelectedTagIds}
 *   options={tags}
 *   hasMany={true}
 * />
 * ```
 */
export const TagSelector: React.FC<TagSelectorProps> = ({
  value,
  onChange,
  options,
  hasMany = true,
  readOnly = false,
  'aria-label': ariaLabel,
}) => {
  // Handle tag selection
  const handleToggle = (tagId: string | number) => {
    if (readOnly) return

    if (hasMany) {
      // Multi-select: toggle tag in array
      const currentIds = [...value]
      const index = currentIds.findIndex((id) => id === tagId)

      if (index >= 0) {
        currentIds.splice(index, 1)
      } else {
        currentIds.push(tagId)
      }

      onChange(currentIds)
    } else {
      // Single-select: toggle or set
      onChange(value.includes(tagId) ? [] : [tagId])
    }
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, tagId: string | number) => {
    if (readOnly) return

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleToggle(tagId)
    }
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'calc(var(--base) * 0.5)',
        padding: 'calc(var(--base) * 0.25)',
      }}
    >
      {options.map((tag) => {
        const isSelected = value.includes(tag.id)
        const hasColor = Boolean(tag.color)

        // Background color: tag's color if selected and has color, success if selected without color, elevation-50 if unselected
        const backgroundColor = isSelected
          ? hasColor
            ? tag.color
            : 'var(--theme-success-500)'
          : 'var(--theme-elevation-50)'

        // Border color
        const borderColor = isSelected
          ? hasColor
            ? tag.color
            : 'var(--theme-success-500)'
          : 'var(--theme-elevation-200)'

        return (
          <button
            key={tag.id}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={tag.title}
            title={tag.title}
            disabled={readOnly}
            tabIndex={0}
            onClick={() => handleToggle(tag.id)}
            onKeyDown={(e) => handleKeyDown(e, tag.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              padding: '8px',
              border: `2px solid ${borderColor}`,
              borderRadius: '50%',
              backgroundColor,
              cursor: readOnly ? 'not-allowed' : 'pointer',
              opacity: readOnly ? 0.5 : 1,
              transition: 'all 0.15s ease',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              if (!readOnly && !isSelected) {
                e.currentTarget.style.backgroundColor = 'var(--theme-elevation-100)'
                e.currentTarget.style.borderColor = 'var(--theme-elevation-300)'
              }
            }}
            onMouseLeave={(e) => {
              if (!readOnly && !isSelected) {
                e.currentTarget.style.backgroundColor = 'var(--theme-elevation-50)'
                e.currentTarget.style.borderColor = 'var(--theme-elevation-200)'
              }
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = '0 0 0 2px var(--theme-success-300)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            {tag.url ? (
              <img
                src={tag.url}
                alt={tag.title}
                style={{
                  width: '28px',
                  height: '28px',
                  objectFit: 'contain',
                  // When selected, make SVG white using CSS filter
                  filter: isSelected ? 'brightness(0) invert(1)' : 'none',
                  transition: 'filter 0.15s ease',
                }}
              />
            ) : (
              // Fallback if no icon
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: isSelected ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-600)',
                  textTransform: 'uppercase',
                }}
              >
                {tag.title.substring(0, 2)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default TagSelector
