'use client'

import type { FieldClientComponent, RelationshipFieldClient } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useEffect, useMemo, useState } from 'react'

import { TagSelector, type TagOption } from './TagSelector'

/**
 * Payload API response structure
 */
interface TagsApiResponse {
  docs: TagOption[]
  totalDocs: number
  limit: number
  page: number
}

/**
 * Tag Selector Field Component
 *
 * A PayloadCMS field component wrapper for TagSelector that provides:
 * - Field state management via useField hook
 * - Label rendering with FieldLabel
 * - Error display with FieldError
 * - Description display with FieldDescription
 * - Automatic tag fetching from Payload REST API
 * - Proper field wrapper structure matching PayloadCMS relationship fields
 *
 * This component integrates the TagSelector UI component into PayloadCMS's
 * field system, following the exact markup structure as relationship fields.
 *
 * Features:
 * - Automatic tag loading from API based on relationTo
 * - Loading and error states
 * - Full integration with PayloadCMS validation and error handling
 * - Read-only mode support
 * - Accessible field structure with proper labels and descriptions
 * - CSS classes matching PayloadCMS field conventions
 *
 * Usage in collection config:
 * ```typescript
 * {
 *   name: 'tags',
 *   type: 'relationship',
 *   relationTo: 'meditation-tags',
 *   hasMany: true,
 *   admin: {
 *     description: 'Select tags for this item',
 *     components: {
 *       Field: '@/components/admin/TagSelectorField',
 *     },
 *   },
 * }
 * ```
 */
export const TagSelectorField: FieldClientComponent = ({ field, readOnly }) => {
  // Extract field properties with nested destructuring for admin
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
  const [tags, setTags] = useState<TagOption[]>([])
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

        const data: TagsApiResponse = await response.json()
        setTags(data.docs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tags')
      } finally {
        setLoading(false)
      }
    }

    fetchTags()
  }, [relationTo])

  // Handle value changes from TagSelector
  const handleChange = (newIds: (string | number)[]) => {
    if (hasMany) {
      setValue(newIds.length > 0 ? newIds : null)
    } else {
      setValue(newIds.length > 0 ? newIds[0] : null)
    }
  }

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
          <TagSelector
            value={selectedIds}
            onChange={handleChange}
            options={tags}
            hasMany={hasMany}
            readOnly={readOnly}
            aria-label={ariaLabel}
          />
        )}
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default TagSelectorField
