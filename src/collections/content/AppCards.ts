import type { CollectionConfig } from 'payload'

import { scheduleField, urlField } from '@/fields'
import { virtualUrlField } from '@/lib/storage/urlFields'

/**
 * App Cards Collection
 *
 * Promotional cards for the WeMeditate App that display images and can link to
 * app pages, external URLs, content items (meditations, albums, lectures), or
 * serve as reminders with recurrence schedules.
 */
export const AppCards: CollectionConfig = {
  slug: 'app-cards',
  labels: {
    singular: 'Card',
    plural: 'Cards',
  },
  versions: {
    drafts: true,
  },
  disableDuplicate: true,
  upload: {
    staticDir: 'media/app-cards',
    bulkUpload: false,
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  },
  admin: {
    group: 'WeMeditate App',
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', '_status'],
  },
  fields: [
    // Virtual URL field for the uploaded card image (Cloudflare Images)
    // Named 'imageUrl' to avoid conflict with the conditional 'linkUrl' field
    virtualUrlField({
      collection: 'app-cards',
      adapter: 'cloudflare-images',
      name: 'imageUrl',
    }),
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
      required: true,
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
    scheduleField({
      required: true,
      admin: {
        condition: (data) => data.type === 'reminder',
      },
    }),
    // Conditional: Content
    {
      name: 'content',
      type: 'relationship',
      relationTo: ['lectures', 'albums', 'meditations'],
      required: true,
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
      required: true,
      admin: {
        condition: (data) => data.type === 'external',
        description: 'External URL this card links to',
      },
    }),
  ],
}
