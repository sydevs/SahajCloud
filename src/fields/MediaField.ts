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
  /** Filter by tag name (e.g., 'meditation-thumbnail') */
  tagName?: string
  /** Admin configuration overrides */
  admin?: Partial<UploadField['admin']>
}

/**
 * Creates a standardized media upload field with ThumbnailCell component
 */
export function MediaField(options: MediaFieldOptions): UploadField {
  const { name, label, required = false, localized = false, tagName, admin = {} } = options

  // Build filter options based on tagName
  const filterOptions = tagName
    ? async ({ req }: { req: any }): Promise<Where> => {
        // Look up the tag by name to get its ID
        const tagResult = await req.payload.find({
          collection: 'media-tags',
          where: {
            name: {
              equals: tagName,
            },
          },
          limit: 1,
        })

        if (tagResult.docs.length === 0) {
          // No tag found with this name, return a filter that matches nothing
          return {
            id: {
              equals: 'non-existent-id',
            },
          }
        }

        const tagId = tagResult.docs[0].id

        // Return filter for media with this tag ID
        return {
          tags: {
            contains: tagId,
          },
        }
      }
    : undefined

  return {
    name,
    label,
    required,
    localized,
    type: 'upload',
    relationTo: 'media',
    filterOptions,
    admin: {
      components: {
        Cell: '@/components/admin/ThumbnailCell',
      },
      ...admin,
    },
  }
}

/**
 * Generate orientation filter conditions based on width/height ratio
 * from fileMetadata stored in Media collection
 */
function getOrientationFilter(orientation: MediaFieldOptions['orientation']) {
  switch (orientation) {
    case 'landscape':
      return [
        // Images with landscape orientation (width > height)
        {
          'fileMetadata.width': {
            greater_than_equal: {
              path: 'fileMetadata.height',
            },
          },
        },
      ]

    case 'portrait':
      return [
        // Images with portrait orientation (height > width)
        {
          'fileMetadata.height': {
            greater_than_equal: {
              path: 'fileMetadata.width',
            },
          },
        },
      ]

    case 'square':
      return [
        // Images with square orientation (width = height)
        {
          'fileMetadata.width': {
            equals: {
              path: 'fileMetadata.height',
            },
          },
        },
      ]

    default:
      return []
  }
}
