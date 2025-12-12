'use client'

import type { FieldClientComponent, RelationshipFieldClient } from 'payload'

import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import React, { useMemo } from 'react'
import useSWR from 'swr'

import { TagSelector, type TagOption, type TagSelectorSize } from './TagSelector'

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
 * Fetcher function for SWR
 * Required because SWR doesn't have a global fetcher configured
 */
const fetcher = (url: string): Promise<TagsApiResponse> =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch tags: ${res.statusText}`)
    return res.json()
  })

/**
 * Tag Selector Field Component
 *
 * A PayloadCMS field component wrapper for TagSelector that provides:
 * - Field state management via useField hook
 * - Label rendering with FieldLabel
 * - Error display with FieldError
 * - Description display with FieldDescription
 * - Automatic tag fetching from Payload REST API with caching
 * - Proper field wrapper structure matching PayloadCMS relationship fields
 *
 * This component integrates the TagSelector UI component into PayloadCMS's
 * field system, following the exact markup structure as relationship fields.
 *
 * Features:
 * - Automatic tag loading from API based on relationTo collection
 * - SWR-based caching with request deduplication
 * - Loading and error states with user feedback
 * - Full integration with PayloadCMS validation and error handling
 * - Read-only mode support
 * - Accessible field structure (listbox/option pattern)
 * - CSS classes matching PayloadCMS field conventions
 *
 * Works with any tag collection that has `id`, `title`, and optionally `url` and `color` fields.
 *
 * @example Usage with meditation-tags
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
 *
 * @example Usage with music-tags
 * ```typescript
 * {
 *   name: 'tags',
 *   type: 'relationship',
 *   relationTo: 'music-tags',
 *   hasMany: true,
 *   admin: {
 *     components: {
 *       Field: '@/components/admin/TagSelector',
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
    hasMany = false,
    minRows,
    maxRows,
    admin: { description, className, style, custom } = {},
  } = field as RelationshipFieldClient

  // Extract size from custom config with type safety
  const size = (custom?.size as TagSelectorSize) || 'default'

  // Use Payload's field hook for state management
  const { value, setValue, showError } = useField<(string | number)[] | string | number | null>()

  // Fetch tags from API with SWR caching
  const collection = Array.isArray(relationTo) ? relationTo[0] : relationTo
  const { data, error, isLoading } = useSWR<TagsApiResponse>(
    `/api/${collection}?limit=100&depth=0`,
    fetcher,
  )
  const tags = data?.docs || []

  // Normalize value to array for consistent handling
  const selectedIds = useMemo(() => {
    if (!value) return []
    if (Array.isArray(value)) {
      return value.map((v) =>
        typeof v === 'object' && v !== null ? (v as { id: string | number }).id : v,
      )
    }
    return [
      typeof value === 'object' && value !== null ? (value as { id: string | number }).id : value,
    ]
  }, [value])

  // Handle value changes from TagSelector
  const handleChange = (newIds: (string | number)[]) => {
    if (hasMany) {
      setValue(newIds.length > 0 ? newIds : null)
    } else {
      setValue(newIds.length > 0 ? newIds[0] : null)
    }
  }

  // Build CSS classes following PayloadCMS conventions
  const fieldClasses = [
    'field-type',
    'relationship',
    className,
    showError && 'error',
    readOnly && 'read-only',
  ]
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

        {isLoading && (
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
            {error.message}
          </div>
        )}

        {!isLoading && !error && tags.length === 0 && (
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

        {!isLoading && !error && tags.length > 0 && (
          <TagSelector
            value={selectedIds}
            onChange={handleChange}
            options={tags}
            hasMany={hasMany}
            readOnly={readOnly}
            required={required}
            minRows={minRows}
            maxRows={maxRows}
            size={size}
            aria-label={ariaLabel}
          />
        )}
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default TagSelectorField
