import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { FRAME_CATEGORY_OPTIONS, GENDER_OPTIONS } from '@/lib/data'
import {
  convertFile,
  processFile,
  sanitizeFilename,
  generateVideoThumbnailHook,
  deleteThumbnailHook,
  setPreviewUrlHook,
} from '@/lib/fieldUtils'
import { MediaField } from '@/fields'

export const Frames: CollectionConfig = {
  labels: {
    plural: 'Meditation Frames',
    singular: 'Meditation Frame',
  },
  slug: 'frames',
  access: permissionBasedAccess('frames'),
  upload: {
    staticDir: 'media/frames',
    hideRemoveFile: true,
    adminThumbnail: 'small',
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
    imageSizes: [
      {
        name: 'small',
        width: 320,
        height: 320,
        position: 'centre',
      },
      {
        name: 'large',
        width: 1000,
        height: 1000,
        position: 'centre',
      },
    ],
  },
  admin: {
    hidden: ({ user }) => !user?.admin,
    group: 'System',
    useAsTitle: 'filename',
    defaultColumns: ['category', 'tags', 'previewUrl', 'imageSet'],
    groupBy: true,
  },
  hooks: {
    beforeOperation: [sanitizeFilename],
    afterRead: [trackClientUsageHook, setPreviewUrlHook],
    beforeValidate: [processFile({})],
    beforeChange: [convertFile],
    afterChange: [generateVideoThumbnailHook],
    afterDelete: [deleteThumbnailHook],
  },
  fields: [
    {
      name: 'previewUrl',
      type: 'text',
      virtual: true,
      admin: {
        hidden: true,
        components: {
          Cell: '@/components/admin/ThumbnailCell',
        },
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
    MediaField({
      name: 'thumbnail',
      required: false,
      admin: {
        readOnly: true,
        description: 'Auto-generated thumbnail for video frames',
        condition: (data) => data?.mimeType?.startsWith('video/'),
      },
    }),
    {
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
