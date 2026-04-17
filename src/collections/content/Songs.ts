import type { CollectionConfig, CollectionBeforeChangeHook } from 'payload'

import { virtualUrlField } from '@/lib/storage/urlFields'

/** Module-level cache for the vocals tag ID (looked up once per process). */
let vocalsTagId: number | undefined

/**
 * Auto-sets `excludeFromMeditations` when the song's tags include the
 * `vocals` song-tag. The vocals tag ID is resolved by slug on first
 * successful lookup and cached for the lifetime of the process.
 */
const autoSetExcludeFromMeditations: CollectionBeforeChangeHook = async ({ data, req }) => {
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

  const hasVocals = tagIds.includes(vocalsTagId)
  return { ...data, excludeFromMeditations: hasVocals }
}

export const Songs: CollectionConfig = {
  slug: 'songs',
  trash: true,
  hooks: {
    beforeChange: [autoSetExcludeFromMeditations],
  },
  upload: {
    staticDir: 'media/songs',
    hideRemoveFile: true,
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'album', 'tags'],
    hidden: true, // Always hidden - managed through Albums
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
      name: 'excludeFromMeditations',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Exclude this song from random selection in meditations. Auto-set for songs tagged with vocals.',
        position: 'sidebar',
        readOnly: true,
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
  ],
}
