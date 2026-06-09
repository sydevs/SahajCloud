import type { CollectionConfig } from 'payload'

import { legacyMigrationFields } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'
import { getTimezoneOptions } from '@/lib/timezones'

import { eventDefaultsFallback } from './hooks/eventDefaultsFallback'

/**
 * The four geo levels of the Atlas region tree. Country → Region → Area form
 * the administrative hierarchy; `center` is a meditation center (a venue
 * referenced by more than one event — single-use venues are folded into the
 * event's own address instead).
 */
export const REGION_LEVEL_OPTIONS = [
  { label: 'Country', value: 'country' },
  { label: 'Region', value: 'region' },
  { label: 'Area', value: 'area' },
  { label: 'Center', value: 'center' },
] as const

/**
 * Regions — the nested Sahaj Atlas geo tree. `parent` + `breadcrumbs` are
 * injected by `@payloadcms/plugin-nested-docs` (configured in
 * payload.config.ts). All fields apply uniformly to every level, centers
 * included.
 */
export const Regions: CollectionConfig = {
  slug: 'regions',
  labels: { singular: 'Region', plural: 'Regions' },
  admin: {
    group: 'Sahaj Atlas',
    useAsTitle: 'name',
    defaultColumns: ['name', 'level', 'osmId'],
  },
  hooks: {
    // Inherit eventDefaults (language + timeZone) from the nearest ancestor when blank.
    afterRead: [eventDefaultsFallback],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          fields: [
            {
              name: 'level',
              type: 'select',
              required: true,
              defaultValue: 'country',
              options: [...REGION_LEVEL_OPTIONS],
              admin: {
                components: { Field: '@/components/admin/ToggleGroupField' },
              },
            },
            {
              name: 'name',
              type: 'text',
              required: true,
            },
            {
              name: 'subtitle',
              type: 'text',
              admin: {
                description: 'Text that appears below the region name in listings',
                condition: (data) => ['area', 'center'].includes(data?.level as string),
              },
            },
            {
              name: 'osmId',
              type: 'text',
              label: 'OpenStreetMap ID',
              required: true,
              admin: {
                description:
                  'This is used to fetch geographic data about this region. Set a value of `custom` to create your own region',
              },
            },
            {
              type: 'row',
              admin: {
                // Non-`custom` nodes resolve geometry from `osmId` downstream;
                // only manual ("custom") nodes carry explicit coordinates.
                condition: (data) => data?.osmId === 'custom',
              },
              fields: [
                {
                  name: 'latitude',
                  type: 'number',
                },
                {
                  name: 'longitude',
                  type: 'number',
                },
                {
                  name: 'radius',
                  type: 'number',
                  admin: { description: 'Radius in meters.' },
                },
              ],
            },
          ],
        },
        {
          label: 'Events',
          fields: [
            {
              name: 'events',
              type: 'join',
              collection: 'events',
              on: 'region',
            },
            {
              name: 'eventDefaults',
              type: 'group',
              admin: {
                description: 'These fields will be used to set defaults for Events in this region',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'language',
                      type: 'select',
                      options: getLanguageOptions(),
                      // Inheritance is applied by the collection-level afterRead hook
                      // (needs the fully-assembled breadcrumbs array).
                      admin: {
                        width: '50%',
                      },
                    },
                    {
                      name: 'timeZone',
                      type: 'select',
                      hasMany: true,
                      options: getTimezoneOptions(),
                      admin: {
                        width: '50%',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    ...legacyMigrationFields(),
  ],
}
