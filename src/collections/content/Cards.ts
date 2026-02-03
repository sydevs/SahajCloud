import type { CollectionConfig, FieldHook } from 'payload'

import { urlField } from '@/fields'
import { getCloudflareImagesUrl } from '@/lib/storage/cloudflareImagesAdapter'

/**
 * Cards Collection
 *
 * Promotional cards for the WeMeditate App that display images and can link to
 * app pages, external URLs, content items (meditations, albums, lectures), or
 * serve as reminders with recurrence schedules.
 */
export const Cards: CollectionConfig = {
  slug: 'cards',
  labels: {
    singular: 'Card',
    plural: 'Cards',
  },
  versions: {
    drafts: true,
  },
  disableDuplicate: true,
  upload: {
    staticDir: 'media/cards',
    bulkUpload: false,
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  },
  admin: {
    group: 'We Meditate App',
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', '_status'],
  },
  fields: [
    // Virtual URL field for the uploaded card image (Cloudflare Images)
    // Named 'imageUrl' to avoid conflict with the conditional 'linkUrl' field
    {
      name: 'imageUrl',
      type: 'text',
      virtual: true,
      hooks: {
        afterRead: [
          (({ data }) => {
            if (!data?.filename) return undefined
            return (
              getCloudflareImagesUrl(data.filename) ?? `/api/cards/file/${data.filename}`
            )
          }) as FieldHook,
        ],
      },
      admin: { hidden: true },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'subtitle',
      type: 'text',
      localized: true,
    },
    {
      name: 'button',
      type: 'text',
      localized: true,
      admin: {
        description: 'Button label text',
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'app-page',
      options: [
        { label: 'App Page', value: 'app-page' },
        { label: 'Reminder', value: 'reminder' },
        { label: 'Content', value: 'content' },
        { label: 'External', value: 'external' },
      ],
      admin: {
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
    },
    // Conditional: App Page
    {
      name: 'appPage',
      type: 'select',
      options: [
        { label: 'Map', value: 'map' },
        { label: 'Lectures', value: 'lectures' },
        { label: 'Path', value: 'path' },
        { label: 'Music', value: 'music' },
      ],
      admin: {
        condition: (data) => data.type === 'app-page',
        description: 'Select the app page this card links to',
      },
    },
    // Conditional: Reminder
    {
      name: 'recurrence',
      type: 'json',
      admin: {
        condition: (data) => data.type === 'reminder',
        description: 'Recurrence schedule configuration (JSON)',
      },
    },
    // Conditional: Content
    {
      name: 'content',
      type: 'relationship',
      relationTo: ['lectures', 'albums', 'meditations'],
      admin: {
        condition: (data) => data.type === 'content',
        description: 'Select the content item this card links to',
      },
    },
    // Conditional: External
    urlField({
      name: 'linkUrl',
      label: 'External URL',
      localized: true,
      admin: {
        condition: (data) => data.type === 'external',
        description: 'External URL this card links to',
      },
    }),
  ],
}
