import type { CollectionConfig } from 'payload'

import { refreshLecture } from '@/endpoints'
import { mediaField, urlField } from '@/fields'
import { populateFromNirmalaVidya } from '@/hooks/lectureHooks'

const vimeoUrlField = urlField({
  name: 'nirmalVidyaVimeoUrl',
  label: 'Nirmala Vidya Vimeo URL',
  required: true,
  admin: {
    description:
      'Paste the Vimeo URL from nirmalavidya.com (e.g. https://vimeo.com/123456789). Other fields will be populated automatically on save.',
  },
})

const videoUrlField = urlField({
  name: 'videoUrl',
  label: 'Video URL',
  admin: {
    description: 'HLS stream URL — set automatically from Nirmala Vidya on creation.',
  },
})

export const Lectures: CollectionConfig = {
  slug: 'lectures',
  labels: {
    singular: 'Lecture',
    plural: 'Lectures',
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'thumbnail'],
  },
  endpoints: [refreshLecture],
  hooks: {
    beforeChange: [populateFromNirmalaVidya],
  },
  fields: [
    // === CREATION FIELD ===
    // The Vimeo URL is required on create (the hook populates other fields).
    // After creation, this field becomes read-only at both the UI and API levels.
    {
      ...vimeoUrlField,
      // Immutable after creation at the API level
      access: {
        update: () => false,
      },
      admin: {
        ...vimeoUrlField.admin,
        // Display as read-only in the UI after creation
        readOnly: true,
        // Always shown (both create and edit), but required only on create.
        // The `required: true` on the urlField factory handles create validation.
        // On edit, the field shows as read-only.
        description: vimeoUrlField.admin?.description,
      },
    },

    // === AUTO-POPULATED FIELDS ===
    // These are hidden during create (populated by the beforeChange hook).
    // After creation, they become visible and are user-editable (except videoUrl).

    {
      name: 'title',
      type: 'text',
      required: false, // Hook satisfies this on create; validated on update via condition
      localized: true,
      admin: {
        // Hidden during create — the hook auto-populates this field
        condition: (data) => !!data?.id,
        description: 'Auto-populated from Nirmala Vidya. Can be edited after creation.',
      },
    },

    {
      ...mediaField({ name: 'thumbnail', required: false }),
      admin: {
        // Hidden during create — the hook auto-downloads and sets this field
        condition: (data) => !!data?.id,
        description: 'Auto-downloaded from Nirmala Vidya. Can be replaced after creation.',
      },
    },

    {
      ...videoUrlField,
      required: false, // Hook satisfies this on create
      admin: {
        ...videoUrlField.admin,
        readOnly: true,
        // Hidden during create — the hook sets this from the API
        condition: (data) => !!data?.id,
      },
    },

    urlField({
      name: 'subtitlesUrl',
      label: 'Subtitles URL',
      admin: {
        description:
          'Optional subtitles URL. Not auto-populated — will be supported in a future iteration.',
      },
    }),

    // === METADATA ===
    {
      name: 'lastRefreshed',
      type: 'date',
      admin: {
        readOnly: true,
        condition: (data) => !!data?.id,
        description: 'Timestamp of last successful API sync.',
        date: {
          displayFormat: 'yyyy-MM-dd HH:mm',
        },
        components: {
          afterInput: ['@/components/admin/RefreshLectureButton'],
        },
      },
    },
  ],
}
