import type {
  UploadField,
  Where,
  CollectionAfterDeleteHook,
  CollectionAfterChangeHook,
  FieldHook,
  FieldBase,
} from 'payload'

import { extractRelationId } from '@/types/payload-extensions'

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
  ownerCollection?: 'lessons' | 'frames'
  /** Filter attachments by file type (image, audio, or video) */
  fileType?: 'image' | 'audio' | 'video'
  /** Admin configuration overrides */
  admin?: Partial<UploadField['admin']>
  /** Field-level access control */
  access?: FieldBase['access']
}

/**
 * Creates a standardized file upload field that relates to the 'files' collection.
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
    access,
  } = options

  return {
    name,
    label,
    required,
    localized,
    type: 'upload',
    relationTo: 'files',
    access,
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
      ...(admin as Record<string, unknown>),
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
      collection: 'files',
      id: value as string,
      data: {
        owner: {
          relationTo: collection.slug as 'lessons' | 'frames',
          value: data.id,
        },
      },
    })
  } else {
    // New document - track file in context for later assignment
    req.context = req.context || {}
    if (!req.context.orphanFiles) {
      req.context.orphanFiles = []
    }
    const orphanFiles = req.context.orphanFiles as string[]

    // Handle both string IDs and full objects using type-safe helper
    const fileId = extractRelationId(value)
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
      collection: 'files',
      id: fileId,
      data: {
        owner: {
          relationTo: collection.slug as 'lessons' | 'frames',
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
    collection: 'files',
    where: {
      'owner.value': {
        equals: id,
      },
    },
    limit: 1000,
  })

  for (const fileAttachment of fileAttachmentsToDelete.docs) {
    await req.payload.delete({
      collection: 'files',
      id: fileAttachment.id,
    })
  }
}
