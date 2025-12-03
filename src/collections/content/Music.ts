import type { CollectionConfig, Field } from 'payload'

import { SlugField } from '@nouance/payload-better-fields-plugin/Slug'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess, createFieldAccess } from '@/lib/accessControl'
import { sanitizeFilename } from '@/lib/fieldUtils'
import { handleProjectVisibility } from '@/lib/projectVisibility'


export const Music: CollectionConfig = {
  slug: 'music',
  access: roleBasedAccess('music'),
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
    hidden: handleProjectVisibility(['wemeditate-web', 'wemeditate-app']),
  },
  hooks: {
    beforeOperation: [sanitizeFilename],
    // Removed: processFile, convertFile (Sharp processing not needed for audio files)
    afterRead: [trackClientUsageHook],
  },
  fields: [
    {
      name: 'url',
      type: 'text',
      virtual: true,
      hooks: {
        afterRead: [
          ({ data }: { data?: any }) => {
            // Generate R2 URL if in production
            if (data?.filename && process.env.NODE_ENV === 'production') {
              return `https://${process.env.PUBLIC_ASSETS_URL}/music/${data.filename}`
            }
            // Fallback to PayloadCMS-generated URL (local storage in development)
            return data?.url
          },
        ],
      },
      admin: {
        hidden: true,
      },
    },
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
