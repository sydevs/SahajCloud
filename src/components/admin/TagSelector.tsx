'use client'

import type { FieldClientComponent, RelationshipFieldClient } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Tag data structure returned from API
 */
interface TagData {
  id: string | number
  title: string
  url?: string
  color?: string
}

/**
 * Tag Selector Component
 *
 * A visual tag selector that displays tags as icon buttons in a grid layout.
 * Fetches tags from the Payload REST API and integrates with useField hook.
 *
 * Features:
 * - Visual icon-based tag selection
 * - Support for optional tag colors (uses success color if no color defined)
 * - Multi-select support for hasMany relationships
 * - Keyboard navigation and accessibility
 * - Responsive grid layout with flex-wrap
 *
 * Selection states:
 * - Unselected: White/neutral background, original SVG colors
 * - Selected with color: Tag's color as background, white SVG (via CSS filter)
 * - Selected without color: Success color background, white SVG
 *
 * Usage in collection config:
 * ```typescript
 * {
 *   name: 'tags',
 *   type: 'relationship',
 *   relationTo: 'meditation-tags',
 *   hasMany: true,
 *   admin: {
 *     components: {
 *       Field: '@/components/admin/TagSelector',
 *     },
 *   },
 * }
 * ```
 */
export const TagSelector: FieldClientComponent = ({ field, readOnly }) => {
  const {
    name,
    label,
    localized,
    required,
    relationTo,
    hasMany,
    admin: { description, className, style } = {},
  } = field as RelationshipFieldClient

  // Use Payload's field hook for state management
  const { value, setValue, showError } = useField<(string | number)[] | string | number | null>()

  // State for fetched tags
  const [tags, setTags] = useState<TagData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Normalize value to array for consistent handling
  const selectedIds = useMemo(() => {
    if (!value) return []
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'object' && v !== null ? (v as { id: string | number }).id : v))
    }
    return [typeof value === 'object' && value !== null ? (value as { id: string | number }).id : value]
  }, [value])

  // Fetch tags from API
  useEffect(() => {
    const fetchTags = async () => {
      try {
        setLoading(true)
        setError(null)

        // relationTo can be string or array, handle both
        const collection = Array.isArray(relationTo) ? relationTo[0] : relationTo
        const response = await fetch(`/api/${collection}?limit=100&depth=0`)

        if (!response.ok) {
          throw new Error(`Failed to fetch tags: ${response.statusText}`)
        }

        const data = await response.json()
        setTags(data.docs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tags')
      } finally {
        setLoading(false)
      }
    }

    fetchTags()
  }, [relationTo])

  // Handle tag selection
  const handleToggle = useCallback(
    (tagId: string | number) => {
      if (readOnly) return

      if (hasMany) {
        // Multi-select: toggle tag in array
        const currentIds = [...selectedIds]
        const index = currentIds.findIndex((id) => id === tagId)

        if (index >= 0) {
          currentIds.splice(index, 1)
        } else {
          currentIds.push(tagId)
        }

        setValue(currentIds.length > 0 ? currentIds : null)
      } else {
        // Single-select: toggle or set
        setValue(selectedIds.includes(tagId) ? null : tagId)
      }
    },
    [hasMany, selectedIds, setValue, readOnly],
  )

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, tagId: string | number) => {
      if (readOnly) return

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleToggle(tagId)
      }
    },
    [handleToggle, readOnly],
  )

  // Build CSS classes following PayloadCMS conventions
  const fieldClasses = ['field-type', 'relationship', className, showError && 'error', readOnly && 'read-only']
    .filter(Boolean)
    .join(' ')

  // Generate field ID from path
  const fieldId = `field-${name.replace(/\./g, '__')}`

  // Generate aria-label for accessibility
  const ariaLabel =
    typeof label === 'string'
      ? label
      : typeof label === 'object' && label !== null
        ? label['en'] || Object.values(label)[0] || name
        : name

  return (
    <div className={fieldClasses} id={fieldId} style={style}>
      <FieldLabel label={label} localized={localized} path={name} required={required} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        {loading && (
          <div
            style={{
              padding: 'calc(var(--base) * 0.5)',
              color: 'var(--theme-elevation-500)',
              fontSize: 'calc(var(--base-body-size) * 1px)',
            }}
          >
            Loading tags...
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 'calc(var(--base) * 0.5)',
              color: 'var(--theme-error-500)',
              fontSize: 'calc(var(--base-body-size) * 1px)',
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && tags.length === 0 && (
          <div
            style={{
              padding: 'calc(var(--base) * 0.5)',
              color: 'var(--theme-elevation-500)',
              fontSize: 'calc(var(--base-body-size) * 1px)',
            }}
          >
            No tags available
          </div>
        )}

        {!loading && !error && tags.length > 0 && (
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
            {tags.map((tag) => {
              const isSelected = selectedIds.includes(tag.id)
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
        )}
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default TagSelector
