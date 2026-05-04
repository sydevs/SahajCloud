import type { CollectionConfig } from 'payload'

import { appCardsForAudience } from '@/endpoints'
import { mediaField, scheduleField, urlField } from '@/fields'
import { denyApiClientReads } from '@/lib/access'

/**
 * App Cards Collection
 *
 * Promotional cards for the WeMeditate App that display images and can link to
 * app pages, external URLs, or content items (meditations, albums, lectures).
 * Cards can have optional recurring schedules for countdown/reminder functionality.
 */
export const AppCards: CollectionConfig = {
  slug: 'app-cards',
  labels: {
    singular: 'App Card',
    plural: 'App Cards',
  },
  access: { read: denyApiClientReads('app-cards') },
  versions: {
    drafts: true,
    maxPerDoc: 5,
  },
  disableDuplicate: true,
  endpoints: [appCardsForAudience],
  admin: {
    group: 'WeMeditate App',
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', '_status'],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Appearance',
          fields: [
            mediaField({ name: 'image', label: 'Card Image', required: true }),
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
              name: 'header',
              type: 'text',
              required: true,
              localized: true,
              admin: {
                description:
                  'A custom header that will appear above the card if it is selected as a hero card.',
              },
            },
            {
              name: 'type',
              type: 'select',
              required: true,
              defaultValue: 'app-page',
              options: [
                { label: 'App Page', value: 'app-page' },
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
                { label: 'Live Meditations', value: 'live-meditations' },
              ],
              admin: {
                condition: (data) => data.type === 'app-page',
                description: 'Select the app page this card links to',
              },
            },
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
            {
              name: 'countdown',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description:
                  'Enable recurring schedule for this card (countdown/reminder functionality)',
              },
            },
            {
              name: 'overlay',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                description:
                  'Render the card with a dark overlay and white text instead of the default style.',
              },
            },
            // Conditional: Schedule (shown when countdown is enabled)
            scheduleField({
              hasExclusions: true,
              hasComplexWeekly: true,
              admin: {
                condition: (data) => data.countdown === true,
                description: 'Configure the recurring schedule for this reminder card',
              },
            }),
          ],
        },
        {
          label: 'Rules',
          fields: [
            // Target sections (Hero/Highlight)
            {
              name: 'targetSections',
              type: 'select',
              hasMany: true,
              options: [
                { label: 'Hero Card', value: 'hero' },
                { label: 'Highlights Section', value: 'highlights' },
                { label: 'Lectures Page', value: 'lectures' },
              ],
              admin: {
                description: 'Target sections where this card should appear on the app homepage.',
              },
            },
            // Audiences (hasMany). Empty ⇒ card is hidden from the for-audience
            // endpoint. The card is shown when ANY of the selected audiences
            // passes.
            {
              name: 'audiences',
              type: 'relationship',
              relationTo: 'audiences',
              hasMany: true,
              filterOptions: () => true,
              admin: {
                description:
                  'Audiences that control visibility. The card is shown to a viewer if ANY of the selected audiences passes. If empty, the card is hidden from /api/app-cards/for-audience and never appears on the app homepage.',
              },
            },
            // Selection weight for client-side card prioritization
            {
              name: 'weight',
              type: 'number',
              label: 'Display Frequency',
              min: 1,
              max: 5,
              defaultValue: 3,
              admin: {
                width: '60%',
                description:
                  'Controls how likely this card is to be chosen when displayed to a user.',
                components: {
                  Field: '@/components/admin/RangeSlider',
                },
                custom: {
                  labels: {
                    1: 'Less frequent',
                    3: 'Regular frequency',
                    5: 'More frequent',
                  },
                },
              },
            },
          ],
        },
      ],
    },
  ],
}
