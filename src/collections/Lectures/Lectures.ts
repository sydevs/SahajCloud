import type { CollectionConfig, Where } from 'payload'

import { mediaField, urlField } from '@/fields'
import { LOCALES, getLocaleLabel } from '@/lib/locales'

import { lecturesForAudience } from './endpoints/forAudience'
import { lectureRelatedMeditations } from './endpoints/relatedMeditations'
import { populateFromNirmalaVidya } from './hooks/populateFromNirmalaVidya'
import { resolveClipParent } from './hooks/resolveClipParent'

const LOCALE_OPTIONS = LOCALES.map(({ code }) => ({ label: getLocaleLabel(code), value: code }))

export const Lectures: CollectionConfig = {
  slug: 'lectures',
  labels: {
    singular: 'Lecture',
    plural: 'Lectures',
  },
  endpoints: [lecturesForAudience, lectureRelatedMeditations],
  // Skip the `clips` join when a lecture is hydrated through a relationship
  // (depth ≥ 1) — e.g. a clip's `fullLecture` parent in the for-audience /
  // related-lectures feeds. The join fires a per-row subquery, so populating it
  // across a candidate pool is an N+1 no relationship consumer needs (the app
  // never reads a nested lecture's `clips`). Mirrors
  // `Meditations.defaultPopulate: { tagAssignments: false }`. Direct reads and
  // the admin edit view (which loads a lecture head-on, not via a relationship)
  // still get `clips`. See #541.
  defaultPopulate: {
    clips: false,
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'thumbnail'],
  },
  hooks: {
    // resolveClipParent runs first so clip records have their parent resolved
    // (and `nirmalVidyaVimeoUrl` nulled) before populateFromNirmalaVidya checks
    // `type === 'full'` and decides whether to fetch from NV.
    beforeChange: [resolveClipParent, populateFromNirmalaVidya],
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'full',
      options: [
        { label: 'Full Lecture', value: 'full' },
        { label: 'Clip', value: 'clip' },
      ],
      access: {
        update: () => false, // immutable after creation
      },
      admin: {
        description:
          'Whether this is a full lecture or a clip excerpted from one. Cannot be changed after creation.',
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
    },
    urlField({
      name: 'nirmalVidyaVimeoUrl',
      required: false, // Required only at validation time for full lectures (clips can use fullLecture instead)
      // Indexed for query performance. Uniqueness is enforced in
      // `populateFromNirmalaVidya` for full lectures only — clips have their
      // URL nulled after the parent is resolved.
      index: true,
      admin: {
        description:
          'Paste the Vimeo URL from amruta.org (e.g. https://vimeo.com/123456789). For clips, this is a creation-time lookup key — supply it OR pick a Full Lecture below; it is nulled after save.',
        // Show during create for either type; hide on a saved clip (URL is nulled there).
        condition: (data) => !data?.id || data?.type === 'full',
      },
      access: {
        update: () => false, // Vimeo URL is immutable after creation
      },
    }),
    {
      name: 'title',
      type: 'text',
      required: false, // Hook satisfies this on create for full lectures
      localized: true,
      admin: {
        condition: (data) => !!data?.id, // Hidden during create — the hook auto-populates this field for full lectures
      },
    },
    mediaField({
      name: 'thumbnail',
      required: false,
      admin: {
        description:
          'Optional override for the Nirmala Vidya thumbnail. If blank, the API thumbnail is used.',
        condition: (data) => !!data?.id,
      },
    }),
    {
      type: 'row',
      fields: [
        {
          name: 'startTime',
          type: 'number',
          min: 0,
          admin: {
            description: 'Optional start of the playback window (HH:MM:SS).',
            components: {
              Field: '@/components/admin/TimestampInput',
            },
            condition: (data) => !!data?.id,
          },
        },
        {
          name: 'stopTime',
          type: 'number',
          min: 0,
          admin: {
            description: 'Optional stop of the playback window (HH:MM:SS).',
            components: {
              Field: '@/components/admin/TimestampInput',
            },
            condition: (data) => !!data?.id,
          },
          validate: (
            value: number | null | undefined,
            { siblingData }: { siblingData: Record<string, unknown> },
          ) => {
            if (typeof value === 'number' && typeof siblingData?.startTime === 'number') {
              if (value <= siblingData.startTime) {
                return 'Stop time must be after start time'
              }
            }
            return true
          },
        },
      ],
    },
    {
      name: 'subtitles',
      type: 'array',
      localized: false,
      admin: {
        description:
          'Per-locale subtitle overrides. Any locale not listed here falls back to the parent lecture’s Nirmala Vidya subtitles.',
        condition: (data) => !!data?.id && data?.type === 'clip',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'locale',
              type: 'select',
              required: true,
              options: LOCALE_OPTIONS,
            },
            {
              name: 'url',
              type: 'text',
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: 'metadata',
      type: 'json',
      access: {
        // Clips source NV metadata from their parent and have `metadata: null`
        // by design (#338). Reject API writes that would diverge a clip from
        // its parent. Hooks bypass field access, so internal mutations stand.
        update: ({ doc }) => doc?.type === 'full',
      },
      admin: {
        readOnly: true,
        condition: (data) => !!data?.id && data?.type === 'full',
        description: 'Auto-populated from Nirmala Vidya API and updated monthly.',
      },
    },
    {
      name: 'fullLecture',
      type: 'relationship',
      relationTo: 'lectures',
      filterOptions: ({ id }) => {
        // Restrict to full lectures, and exclude self when editing.
        const where: Where = { type: { equals: 'full' } }
        if (id) where.id = { not_equals: id }
        return where
      },
      admin: {
        description:
          'The full lecture this clip is excerpted from. Required for clips (alternatively, supply a Vimeo URL during create to look up or create the parent automatically).',
        condition: (data) => data?.type === 'clip',
        position: 'sidebar',
      },
    },
    {
      name: 'audiences',
      type: 'relationship',
      relationTo: 'audiences',
      hasMany: true,
      admin: {
        description:
          'A user can view this lecture if they are a member of any of these audience groups. If empty, this lecture is only visible when directly referenced (e.g. from a meditation or path step).',
        position: 'sidebar',
        condition: (data) => !!data?.id,
      },
    },
    {
      name: 'userChoices',
      type: 'relationship',
      relationTo: 'user-choices',
      hasMany: true,
      admin: {
        description:
          'User choices this lecture is relevant to. Used by the app to select contextually appropriate lectures.',
        position: 'sidebar',
        condition: (data) => !!data?.id,
      },
    },
    {
      name: 'subtleSystemNodes',
      type: 'relationship',
      relationTo: 'subtle-system-nodes',
      hasMany: true,
      admin: {
        description:
          'Chakras and nadis discussed in this lecture. This allows us to select relevant lectures when a viewer finishes a meditation.',
        position: 'sidebar',
        condition: (data) => !!data?.id,
      },
    },
    {
      name: 'priority',
      type: 'number',
      min: 0,
      max: 100,
      defaultValue: 0,
      admin: {
        description:
          'Lectures with priority > 0 are always returned first in the for-audience feed, sorted by priority (highest first). Lectures with equal priority are shuffled randomly. Leave at 0 for the normal random pool.',
        position: 'sidebar',
        condition: (data) => !!data?.id,
      },
    },
    {
      name: 'clips',
      type: 'join',
      collection: 'lectures',
      on: 'fullLecture',
      admin: {
        allowCreate: true,
        defaultColumns: ['title', 'startTime', 'stopTime', 'subtleSystemNodes'],
        condition: (data) => !!data?.id && data?.type === 'full',
      },
    },
  ],
}
