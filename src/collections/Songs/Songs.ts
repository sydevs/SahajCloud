import type { CollectionConfig, CollectionBeforeChangeHook } from 'payload'

import { fileMetadataField } from '@/fields'
import { restrictUploadToAdmin } from '@/plugins/access'
import { virtualUrlField } from '@/plugins/storage/urlFields'

/** Module-level cache for the vocals tag ID (looked up once per process). */
let vocalsTagId: number | undefined

/**
 * On create only: sets `includeForMeditations` to `false` when the new song's
 * tags include the `vocals` song-tag. After creation, the field is fully
 * manual — adding or removing the vocals tag later does not change it.
 */
const autoSetIncludeForMeditationsOnCreate: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data

  if (vocalsTagId === undefined) {
    const result = await req.payload.find({
      collection: 'song-tags',
      where: { slug: { equals: 'vocals' } },
      select: {},
      limit: 1,
      depth: 0,
    })
    vocalsTagId = result.docs[0]?.id as number | undefined
  }

  if (!vocalsTagId) return data

  const tagIds = Array.isArray(data.tags)
    ? data.tags.map((t: number | { id: number }) =>
        typeof t === 'object' && t !== null ? t.id : t,
      )
    : []

  if (!tagIds.includes(vocalsTagId)) return data

  return { ...data, includeForMeditations: false }
}

export const Songs: CollectionConfig = {
  slug: 'songs',
  trash: true,
  hooks: {
    beforeChange: [
      restrictUploadToAdmin({ label: 'audio file on a song' }),
      autoSetIncludeForMeditationsOnCreate,
    ],
  },
  upload: {
    staticDir: 'media/songs',
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'album', 'tags'],
    hidden: true, // Always hidden - managed through Albums
    components: {
      edit: {
        // Adds an <audio> player beneath the native upload field (the
        // Meditations-only drift banner is inert here — songs have no frames).
        Upload: '@/components/admin/AudioUpload',
      },
    },
  },
  fields: [
    virtualUrlField({ collection: 'songs', adapter: 'r2' }),
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
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
      relationTo: 'song-tags',
      hasMany: true,
      admin: {
        components: {
          Field: '@/components/admin/TagSelector',
        },
      },
    },
    {
      name: 'includeForMeditations',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Include this song in random selection in meditations. Auto-set to false on creation when the song has the vocals tag, then manually editable.',
        position: 'sidebar',
      },
    },
    fileMetadataField(),
  ],
}
