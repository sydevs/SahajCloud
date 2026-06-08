import type { CollectionConfig } from 'payload'

import { legacyMigrationFields } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'
import { getTimezoneOptions } from '@/lib/timezones'

import { defaultEventLanguageFallback } from './hooks/defaultEventLanguageFallback'

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
    defaultColumns: ['name', 'level', 'countryCode'],
  },
  hooks: {
    // Inherit defaultEventLanguage from the nearest ancestor when blank.
    afterRead: [defaultEventLanguageFallback],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
            },
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
              type: 'row',
              fields: [
                {
                  name: 'countryCode',
                  type: 'text',
                  admin: {
                    width: '50%',
                    description: 'ISO 3166-1 alpha-2 country code.',
                  },
                },
                {
                  name: 'osmId',
                  type: 'text',
                  required: true,
                  admin: {
                    width: '50%',
                    description:
                      "OpenStreetMap id. Accepts sentinels like 'custom' (manual coordinates); centers resolve a real OSM id at import.",
                  },
                },
              ],
            },
            {
              name: 'defaultEventLanguage',
              type: 'select',
              options: getLanguageOptions(),
              // Inheritance is applied by the collection-level afterRead hook
              // (needs the fully-assembled breadcrumbs array).
              admin: {
                description:
                  'Default language for events here. Inherits from the nearest ancestor when left blank.',
              },
            },
            {
              name: 'subtitle',
              type: 'text',
            },
          ],
        },
        {
          label: 'Location',
          fields: [
            {
              name: 'timeZone',
              type: 'select',
              hasMany: true,
              options: getTimezoneOptions(),
              admin: {
                description: 'IANA timezone(s) this region spans.',
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
                  admin: { width: '33%' },
                },
                {
                  name: 'longitude',
                  type: 'number',
                  admin: { width: '33%' },
                },
                {
                  name: 'radius',
                  type: 'number',
                  admin: { width: '33%', description: 'Radius in meters.' },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'events',
      type: 'join',
      collection: 'events',
      on: 'region',
    },
    ...legacyMigrationFields(),
  ],
}
