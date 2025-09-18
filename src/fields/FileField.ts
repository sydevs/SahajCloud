import type { UploadField } from 'payload'

export type FileFieldOptions = {
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
 * Creates a standardized file upload field that relates to the 'files' collection.
 * Files are owned by the parent document and will be deleted when the owner is deleted.
 */
export function FileField(options: FileFieldOptions): UploadField {
  const { name, label, required = false, localized = false, admin = {} } = options

  return {
    name,
    label,
    required,
    localized,
    type: 'upload',
    relationTo: 'files',
    admin,
  }
}
