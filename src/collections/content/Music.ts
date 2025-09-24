import type { CollectionConfig, Field } from 'payload'
import { permissionBasedAccess, createFieldAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { convertFile, processFile, sanitizeFilename } from '@/lib/fieldUtils'
import { SlugField } from '@nouance/payload-better-fields-plugin/Slug'

export const Music: CollectionConfig = {
  slug: 'music',
  access: permissionBasedAccess('music'),
  trash: true,
  upload: {
    staticDir: 'media/music',
    hideRemoveFile: true,
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'duration', 'tags'],
  },
  hooks: {
    beforeOperation: [sanitizeFilename],
    beforeValidate: [processFile({})],
    beforeChange: [convertFile],
    afterRead: [trackClientUsageHook],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      access: createFieldAccess('music', true),
    },
    ...SlugField('title', {
      slugOverrides: {
        unique: true,
        admin: {
          position: 'sidebar',
        },
      },
    }),
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'music-tags',
      hasMany: true,
    },
    {
      name: 'credit',
      type: 'text',
      localized: true,
      admin: {
        description: 'Attribution or credit information',
      },
    },
    {
      name: 'fileMetadata',
      type: 'json',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ].map((field) => {
    return { access: createFieldAccess('music', false), ...field } as Field
  }),
}
