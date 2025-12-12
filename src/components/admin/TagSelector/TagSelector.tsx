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

/**
 * Size preset type for TagSelector
 * - 'default': Standard size (~48px buttons with --base: 20px)
 * - 'large': Larger size (~64px buttons) for prominent display
 *
 * Sizes scale with PayloadCMS's --base CSS variable for consistent theming.
 */
export type TagSelectorSize = 'default' | 'large'

/**
 * Size presets using PayloadCMS CSS variables for consistent scaling.
 * Based on --base (20px default) and --base-body-size (13px default).
 */
const SIZE_PRESETS = {
  default: {
    button: 'calc(var(--base) * 2.4)', // 48px
    icon: 'calc(var(--base) * 1.8)', // 36px
    container: 'calc(var(--base) * 2.8)', // 56px
    title: 'calc(var(--base-body-size) * 0.77px)', // ~10px
    gap: 'calc(var(--base) * 0.2)', // 4px
    fallbackFont: 'calc(var(--base) * 0.8)', // ~16px for 2-letter fallback
    padding: 'calc(var(--base) * 0.3)', // ~6px
  },
  large: {
    button: 'calc(var(--base) * 3.2)', // 64px
    icon: 'calc(var(--base) * 2.4)', // 48px
    container: 'calc(var(--base) * 3.6)', // 72px
    title: 'calc(var(--base-body-size) * 0.85px)', // ~11px
    gap: 'calc(var(--base) * 0.25)', // 5px
    fallbackFont: 'calc(var(--base) * 1.05)', // ~21px for 2-letter fallback
    padding: 'calc(var(--base) * 0.4)', // ~8px
  },
} as const

export interface TagSelectorProps {
  value: (string | number)[]
  onChange: (value: (string | number)[]) => void
  options: TagOption[]
  hasMany?: boolean
  readOnly?: boolean
  required?: boolean
  minRows?: number
  maxRows?: number
  size?: TagSelectorSize
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
 * - Keyboard navigation (Enter/Space to toggle)
 * - Responsive grid layout with flex-wrap
 *
 * Accessibility:
 * - Uses `role="listbox"` with `aria-multiselectable` for the container
 * - Uses `role="option"` with `aria-selected` for individual tags
 * - Supports `aria-readonly` when in read-only mode
 * - Full keyboard support for selection
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
  required = false,
  minRows,
  maxRows,
  size = 'default',
  'aria-label': ariaLabel,
}) => {
  // Get size preset values
  const sizes = SIZE_PRESETS[size]
  // Helper: Check if a tag ID is currently selected (handles type coercion)
  const isTagSelected = (tagId: string | number): boolean => {
    return value.some((id) => String(id) === String(tagId))
  }

  // Helper: Check if a tag can be deselected
  const canDeselect = (): boolean => {
    if (hasMany) {
      // In multi-select, can't deselect below minRows
      return !minRows || value.length > minRows
    } else {
      // In single-select, can't deselect if required
      return !required
    }
  }

  // Helper: Check if a tag can be selected
  const canSelect = (): boolean => {
    if (hasMany) {
      // In multi-select, can't select above maxRows
      return !maxRows || value.length < maxRows
    }
    // Single-select can always select (it replaces)
    return true
  }

  // Handle tag selection
  const handleToggle = (tagId: string | number) => {
    if (readOnly) return

    const isSelected = isTagSelected(tagId)

    if (hasMany) {
      // Multi-select mode
      if (isSelected) {
        if (!canDeselect()) return
        onChange(value.filter((id) => String(id) !== String(tagId)))
      } else {
        if (!canSelect()) return
        onChange([...value, tagId])
      }
    } else {
      // Single-select mode: switch or toggle
      if (isSelected) {
        if (!canDeselect()) return
        onChange([])
      } else {
        // Directly switch to new tag
        onChange([tagId])
      }
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
      role="listbox"
      aria-label={ariaLabel}
      aria-multiselectable={hasMany}
      aria-readonly={readOnly}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'calc(var(--base) * 0.75)',
        padding: 'calc(var(--base) * 0.25)',
      }}
    >
      {options.map((tag) => {
        const isSelected = isTagSelected(tag.id)
        const hasColor = Boolean(tag.color)

        // Check if this specific tag can be toggled
        const canToggleThis = isSelected ? canDeselect() : canSelect()
        const isDisabled = readOnly || !canToggleThis

        // Background color: tag's color if selected and has color, lighter elevation if selected without color, transparent if unselected
        const backgroundColor = isSelected
          ? hasColor
            ? tag.color
            : 'var(--theme-elevation-200)'
          : 'transparent'

        return (
          <div
            key={tag.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: sizes.gap,
              width: sizes.container,
            }}
          >
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={tag.title}
              aria-disabled={isDisabled}
              disabled={readOnly}
              tabIndex={0}
              onClick={() => handleToggle(tag.id)}
              onKeyDown={(e) => handleKeyDown(e, tag.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: sizes.button,
                height: sizes.button,
                padding: sizes.padding,
                border: 'none',
                borderRadius: '50%',
                backgroundColor,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.5 : 1,
                transition: 'all 0.15s ease',
                outline: 'none',
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
                e.currentTarget.style.boxShadow = '0 0 0 2px var(--theme-elevation-200)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {tag.url ? (
                <img
                  src={tag.url}
                  alt=""
                  style={{
                    width: sizes.icon,
                    height: sizes.icon,
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
                    fontSize: sizes.fallbackFont,
                    fontWeight: 600,
                    color: isSelected ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-600)',
                    textTransform: 'uppercase',
                  }}
                >
                  {tag.title.substring(0, 2)}
                </span>
              )}
            </button>
            <span
              style={{
                fontSize: sizes.title,
                fontWeight: 500,
                color: 'var(--theme-elevation-600)',
                textAlign: 'center',
                lineHeight: 1.2,
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {tag.title}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default TagSelector
