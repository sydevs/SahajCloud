import type { UploadField, Where } from 'payload'

export type MediaFieldOptions = {
  /** Field name */
  name: string
  /** Field label */
  label?: string
  /** Whether the field is required */
  required?: boolean
  /** Whether field should be localized */
  localized?: boolean
  /** Constrain selection to specific image orientation */
  orientation?: 'landscape' | 'portrait' | 'square'
  /** Filter by tag name (e.g., 'thumbnail', 'icon') */
  tagName?: string
  /** Admin configuration overrides */
  admin?: Partial<UploadField['admin']>
}

/**
 * Creates a standardized media upload field with ThumbnailCell component
 */
export function mediaField(options: MediaFieldOptions): UploadField {
  const { name, label, required = false, localized = false, tagName, admin = {} } = options

  // Build filter options based on tagName (now uses string enum values directly)
  const filterOptions = tagName
    ? async (): Promise<Where> => ({
        tags: {
          contains: tagName,
        },
      })
    : undefined

  return {
    name,
    label,
    required,
    localized,
    type: 'upload',
    relationTo: 'images',
    filterOptions,
    admin: {
      components: {
        Cell: '@/components/admin/ThumbnailCell/RelationshipThumbnailCell',
      },
      ...(admin as Record<string, unknown>),
    },
  }
}
