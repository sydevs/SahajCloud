import type { UploadField, Where } from 'payload'

export type MediaFieldOptions = {
  name: string
  label?: string
  required?: boolean
  localized?: boolean
  /** ⚠ Read by nothing. Two blocks pass one and get an unfiltered picker (#1314). */
  orientation?: 'landscape' | 'portrait' | 'square'
  /** Constrain selection to images carrying this tag, e.g. `thumbnail`. */
  tagName?: string
  admin?: Partial<UploadField['admin']>
}

/** An `images` upload field, with the shared ThumbnailCell in the list view. */
export function mediaField(options: MediaFieldOptions): UploadField {
  const { name, label, required = false, localized = false, tagName, admin = {} } = options

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
