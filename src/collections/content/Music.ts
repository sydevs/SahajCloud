import type { CollectionConfig, Field } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess, createFieldAccess } from '@/lib/access'
import { handleProjectVisibility } from '@/lib/projectVisibility'
import { virtualUrlField } from '@/lib/storage/urlFields'

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
    defaultColumns: ['title', 'album', 'duration', 'tags'],
    hidden: handleProjectVisibility('music', ['wemeditate-web', 'wemeditate-app']),
  },
  hooks: {
    // Filename sanitization is handled by the R2 storage adapter
    // No collection-level hooks needed for filename management
    afterRead: [trackClientUsageHook],
  },
  fields: [
    virtualUrlField({
      collection: 'music',
      adapter: 'r2',
    }),
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      access: createFieldAccess('music', true),
    },
    {
      name: 'album',
      type: 'relationship',
      relationTo: 'albums',
      required: true,
      admin: {
        description: 'The album this track belongs to',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'music-tags',
      hasMany: true,
      admin: {
        components: {
          Field: '@/components/admin/TagSelector',
        },
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
