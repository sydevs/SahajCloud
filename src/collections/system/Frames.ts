import type { CollectionConfig } from 'payload'

import {
  claimOrphanFileAttachmentsHook,
  deleteFileAttachmentsHook,
} from '@/fields/FileAttachmentField'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/accessControl'
import { FRAME_CATEGORY_OPTIONS, GENDER_OPTIONS } from '@/lib/data'
import { handleProjectVisibility } from '@/lib/projectVisibility'

export const Frames: CollectionConfig = {
  labels: {
    plural: 'Meditation Frames',
    singular: 'Meditation Frame',
  },
  slug: 'frames',
  access: roleBasedAccess('frames'),
  indexes: [
    {
      fields: ['imageSet'],
    },
  ],
  upload: {
    staticDir: 'media/frames',
    hideRemoveFile: true,
    mimeTypes: [
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      // Videos
      'video/mp4',
      'video/webm',
    ],
    // imageSizes removed - using Cloudflare Images flexible variants and Stream thumbnails
  },
  admin: {
    hidden: handleProjectVisibility(['wemeditate-app']),
    group: 'Resources',
    useAsTitle: 'filename',
    defaultColumns: ['category', 'tags', 'previewUrl', 'imageSet'],
    groupBy: true,
  },
  hooks: {
    // Removed: sanitizeFilename (not needed - Cloudflare provides unique IDs)
    afterRead: [trackClientUsageHook],
    // Removed: processFile, convertFile (Sharp processing)
    // Removed: generateVideoThumbnailHook (FFmpeg processing)
    // Removed: setPreviewUrlHook (replaced by thumbnailUrl virtual field)
    afterChange: [
      // Update database with adapter-updated filename (runs AFTER storage adapter)
      async ({ req, doc, operation }) => {
        // Only process on create operations with file uploads
        if (operation !== 'create' || !req.file?.name) {
          return
        }

        // Check if filename was updated by storage adapter
        const adapterFilename = req.file.name
        const dbFilename = doc.filename

        if (adapterFilename !== dbFilename) {
          // Filename was updated by adapter - update database record
          await req.payload.update({
            collection: 'frames',
            id: doc.id,
            data: {
              filename: adapterFilename,
            },
          })
        }
      },
      claimOrphanFileAttachmentsHook,
    ],
    afterDelete: [deleteFileAttachmentsHook],
  },
  fields: [
    {
      name: 'thumbnailUrl',
      type: 'text',
      virtual: true,
      hooks: {
        afterRead: [
          ({ data }) => {
            if (!data?.filename) return undefined

            if (data.mimeType?.startsWith('video/')) {
              // Cloudflare Stream thumbnail
              const deliveryUrl = process.env.CLOUDFLARE_STREAM_DELIVERY_URL
              return deliveryUrl
                ? `${deliveryUrl}/${data.filename}/thumbnails/thumbnail.jpg?height=320`
                : data?.url
            } else if (data.mimeType?.startsWith('image/')) {
              // Cloudflare Images thumbnail
              const deliveryUrl = process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
              return deliveryUrl
                ? `${deliveryUrl}/${data.filename}/format=auto,width=320,height=320,fit=cover`
                : data?.url
            }
            return data?.url
          },
        ],
      },
      admin: {
        hidden: true,
        components: {
          Cell: '@/components/admin/ThumbnailCell',
        },
      },
    },
    {
      name: 'streamMp4Url',
      type: 'text',
      virtual: true,
      hooks: {
        afterRead: [
          ({ data }) => {
            if (data?.mimeType?.startsWith('video/') && data?.filename) {
              // Extract customer code from delivery URL: https://customer-{code}.cloudflarestream.com
              const deliveryUrl = process.env.CLOUDFLARE_STREAM_DELIVERY_URL
              return deliveryUrl
                ? `${deliveryUrl}/${data.filename}/downloads/default.mp4`
                : data?.url
            }
            return data?.url
          },
        ],
      },
      admin: {
        readOnly: true,
        description: 'Direct MP4 URL for HTML5 video playback',
        condition: (data) => data?.mimeType?.startsWith('video/'),
      },
    },
    {
      name: 'previewUrl',
      type: 'text',
      virtual: true,
      hooks: {
        afterRead: [
          ({ data }) => {
            // Use thumbnailUrl for preview (works for both images and videos)
            return data?.thumbnailUrl
          },
        ],
      },
      admin: {
        hidden: true,
      },
    },
    {
      name: 'imageSet',
      type: 'select',
      options: GENDER_OPTIONS,
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      options: [...FRAME_CATEGORY_OPTIONS],
      required: true,
    },
    {
      name: 'tags',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Anahat', value: 'anahat' },
        { label: 'Back', value: 'back' },
        { label: 'Bandhan', value: 'bandhan' },
        { label: 'Both Hands', value: 'both hands' },
        { label: 'Center', value: 'center' },
        { label: 'Channel', value: 'channel' },
        { label: 'Earth', value: 'earth' },
        { label: 'Ego', value: 'ego' },
        { label: 'Feel', value: 'feel' },
        { label: 'Ham Ksham', value: 'ham ksham' },
        { label: 'Hamsa', value: 'hamsa' },
        { label: 'Hand', value: 'hand' },
        { label: 'Hands', value: 'hands' },
        { label: 'Ida', value: 'ida' },
        { label: 'Left', value: 'left' },
        { label: 'Left Handed', value: 'lefthanded' },
        { label: 'Massage', value: 'massage' },
        { label: 'Pingala', value: 'pingala' },
        { label: 'Raise', value: 'raise' },
        { label: 'Right', value: 'right' },
        { label: 'Right Handed', value: 'righthanded' },
        { label: 'Rising', value: 'rising' },
        { label: 'Silent', value: 'silent' },
        { label: 'Superego', value: 'superego' },
        { label: 'Tapping', value: 'tapping' },
      ],
    },
    {
      // Removed: thumbnail FileAttachmentField (replaced by thumbnailUrl virtual field from Cloudflare Stream)
      name: 'duration',
      type: 'number',
      hooks: {
        afterRead: [
          async ({ data }) => {
            return data &&
              typeof data.fileMetadata === 'object' &&
              typeof data.fileMetadata.duration === 'number'
              ? Math.round(data.fileMetadata.duration)
              : undefined
          },
        ],
      },
    },
    {
      name: 'fileMetadata',
      type: 'json',
      defaultValue: {},
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
