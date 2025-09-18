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
  /** Admin configuration overrides */
  admin?: Partial<UploadField['admin']>
}

/**
 * Creates a standardized media upload field with ThumbnailCell component
 * and filtering for hidden media documents
 */
export function MediaField(options: MediaFieldOptions): UploadField {
  const { name, label, required = false, localized = false, admin = {} } = options

  return {
    name,
    label,
    required,
    localized,
    type: 'upload',
    relationTo: 'media',
    admin,
  }
}
