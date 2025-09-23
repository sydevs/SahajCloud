import type { UploadField } from 'payload'

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
  /** Admin configuration overrides */
  admin?: Partial<UploadField['admin']>
}

/**
 * Creates a standardized media upload field with ThumbnailCell component
 * and filtering for hidden media documents
 */
export function MediaField(options: MediaFieldOptions): UploadField {
  const { name, label, required = false, localized = false, orientation, admin = {} } = options

  // Base filter to exclude hidden media
  const baseFilter = {
    hidden: {
      not_equals: true,
    },
  } as any

  // Add orientation filter if specified
  // Note: Path-based comparisons in filterOptions only work for UI filtering,
  // not for validation. Temporarily disabled to prevent validation errors.
  let filterOptions = baseFilter
  // if (orientation) {
  //   const orientationFilters = getOrientationFilter(orientation)
  //   if (orientationFilters.length > 0) {
  //     filterOptions = {
  //       and: [
  //         baseFilter,
  //         {
  //           or: orientationFilters,
  //         },
  //       ],
  //     }
  //   }
  // }

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
