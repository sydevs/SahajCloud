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
  ownerCollection: CollectionSlug
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
    ownerCollection,
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
      // Only show file attachments owned by the current document
      // For new documents (no ID), show no existing file attachments
      // This allows upload but prevents selection of existing file attachments
      if (!data?.id) {
        return {
          id: { equals: 'non-existent-id' }, // No file attachments for new documents
        }
      }

      return {
        'owner.value': {
          equals: data.id,
        },
        'owner.relationTo': {
          equals: ownerCollection, // Ensure we only get file attachments owned by the correct collection
        },
      }
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

    // Only add if not already tracked
    if (!orphanFiles.includes(value as string)) {
      orphanFiles.push(value as string)
      console.log(
        `FileAttachmentField: Tracked orphan file attachment ${value} for later assignment`,
      )
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
  console.log(
    `Claiming ${orphanFileAttachments.length} orphan file attachments for ${operation} operation on ${collection.slug}:${doc.id}`,
  )

  try {
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
      console.log(`Claimed orphan file attachment ${fileId} for ${collection.slug}:${doc.id}`)
    }

    // Clear the context after claiming
    req.context.orphanFiles = []
  } catch (error) {
    req.payload.logger.error(
      `Error claiming orphan file attachments for ${collection.slug}:${doc.id}: ${error}`,
    )
  }
}

// Hook for cascade deletion of file attachments when owner is deleted
export const deleteFileAttachmentsHook: CollectionAfterDeleteHook = async ({ id, req }) => {
  try {
    const fileAttachmentsToDelete = await req.payload.find({
      collection: 'file-attachments',
      where: {
        'owner.value': {
          equals: id,
        },
      },
      limit: 1000,
    })

    console.log(
      `Cascade deleting ${fileAttachmentsToDelete.docs.length} file attachments for deleted document ${id}`,
    )

    for (const fileAttachment of fileAttachmentsToDelete.docs) {
      await req.payload.delete({
        collection: 'file-attachments',
        id: fileAttachment.id,
      })
    }
  } catch (error) {
    req.payload.logger.error(`Error deleting file attachments for document ${id}: ${error}`)
  }
}
