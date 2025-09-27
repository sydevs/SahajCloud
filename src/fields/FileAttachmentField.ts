import type {
  UploadField,
  Where,
  CollectionAfterDeleteHook,
  CollectionAfterChangeHook,
  FieldHook,
  CollectionSlug,
} from 'payload'

export type FileAttachmentFieldOptions = {
  /** Field name */
  name: string
  /** Field label */
  label?: string
  /** Whether the field is required */
  required?: boolean
  /** Whether field should be localized */
  localized?: boolean
  /** The collection that owns these file attachments */
  ownerCollection?: CollectionSlug
  /** Filter attachments by file type (image, audio, or video) */
  fileType?: 'image' | 'audio' | 'video'
  /** Admin configuration overrides */
  admin?: Partial<UploadField['admin']>
}

/**
 * Creates a standardized file upload field that relates to the 'file-attachments' collection.
 * File attachments are owned by the parent document and will be deleted when the owner is deleted.
 *
 * Features:
 * - Automatically sets file attachment owner on upload
 * - Filters file attachments to only show those owned by current document
 * - File attachments are cascade deleted when owner is deleted
 */
export function FileAttachmentField(options: FileAttachmentFieldOptions): UploadField {
  const {
    name,
    label,
    required = false,
    localized = false,
    ownerCollection = 'lessons',
    fileType,
    admin = {},
  } = options

  return {
    name,
    label,
    required,
    localized,
    type: 'upload',
    relationTo: 'file-attachments',
    filterOptions: ({ data }): Where => {
      // Only show file attachments owned by the current document or orphan files
      // For new documents (no ID), show no existing file attachments
      // This allows upload but prevents selection of existing file attachments
      if (!data?.id) {
        return {
          id: { equals: 'non-existent-id' }, // No file attachments for new documents
        }
      }

      const ownerFilter: Where = {
        or: [
          {
            // Files owned by this document
            'owner.value': {
              equals: data.id,
            },
            'owner.relationTo': {
              equals: ownerCollection,
            },
          },
          {
            // Orphan files (no owner set yet)
            owner: {
              exists: false,
            },
          },
        ],
      }

      // If fileType is specified, add mimeType filtering
      if (fileType) {
        return {
          and: [
            ownerFilter,
            {
              mimeType: {
                contains: `${fileType}/`, // e.g., 'audio/' matches 'audio/mpeg'
              },
            },
          ],
        }
      }

      return ownerFilter
    },
    hooks: {
      afterChange: [setFileOwnerHook],
    },
    admin: {
      ...admin,
    },
  }
}

/**
 * Field-level hook to set file attachment ownership after a file is selected/uploaded
 */
const setFileOwnerHook: FieldHook = async ({ value, data, req, collection }) => {
  if (!value) return

  // If document has ID, set owner immediately
  if (data?.id && collection?.slug) {
    await req.payload.update({
      collection: 'file-attachments',
      id: value as string,
      data: {
        owner: {
          relationTo: collection.slug as any,
          value: data.id,
        },
      },
    })
    console.log(
      `FileAttachmentField: Set owner for file attachment ${value} to ${collection?.slug}:${data.id}`,
    )
  } else {
    // New document - track file in context for later assignment
    req.context = req.context || {}
    if (!req.context.orphanFiles) {
      req.context.orphanFiles = []
    }
    const orphanFiles = req.context.orphanFiles as string[]

    // Handle both string IDs and full objects
    const fileId = typeof value === 'string' ? value : (value as any)?.id
    if (fileId && !orphanFiles.includes(fileId)) {
      orphanFiles.push(fileId)
    }
  }
}

// Hook to claim orphan file attachments after document creation or update
export const claimOrphanFileAttachmentsHook: CollectionAfterChangeHook = async ({
  doc,
  req,
  operation,
  collection,
}) => {
  const orphanFileAttachments = req.context?.orphanFiles as string[] | undefined

  // Only process if we have a document ID and orphan file attachments
  if (!doc?.id || !orphanFileAttachments?.length) {
    return
  }

  // Only process for create and update operations
  if (operation !== 'create' && operation !== 'update') {
    return
  }

  // Claim each orphan file attachment for this document
  for (const fileId of orphanFileAttachments) {
    await req.payload.update({
      collection: 'file-attachments',
      id: fileId,
      data: {
        owner: {
          relationTo: collection.slug as any,
          value: doc.id,
        },
      },
    })
  }

  // Clear the context after claiming
  req.context.orphanFiles = []
}

// Hook for cascade deletion of file attachments when owner is deleted
export const deleteFileAttachmentsHook: CollectionAfterDeleteHook = async ({ id, req }) => {
  const fileAttachmentsToDelete = await req.payload.find({
    collection: 'file-attachments',
    where: {
      'owner.value': {
        equals: id,
      },
    },
    limit: 1000,
  })

  for (const fileAttachment of fileAttachmentsToDelete.docs) {
    await req.payload.delete({
      collection: 'file-attachments',
      id: fileAttachment.id,
    })
  }
}
