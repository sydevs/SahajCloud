import type { CollectionConfig } from 'payload'

import { createBreadcrumbsField } from '@payloadcms/plugin-nested-docs'

import { hideUntilCreated, legacyMigrationFields } from '@/fields'
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
  { label: 'City', value: 'city' },
  { label: 'SY Center', value: 'center' },
] as const

/**
 * Manual coordinates apply only to nodes whose location was entered by hand
 * (`mapboxId === 'manual'`); a Mapbox-identified node resolves geometry from
 * its id downstream. Used as each coordinate field's own `condition` so that —
 * being `required` only when visible — Payload keeps the columns nullable (a
 * `required` field with no own condition would force a NOT NULL column and
 * reject every Mapbox-identified region).
 */
const isManualLocation = (data: Record<string, unknown>): boolean => data?.mapboxId === 'manual'

/** Region levels ordered country → center (index ascends as you go deeper). */
const REGION_LEVELS: string[] = REGION_LEVEL_OPTIONS.map((option) => option.value)

/**
 * Condition for a per-level `children` join: show it only when `childLevel` is a
 * *valid* child of the current node — i.e. strictly deeper (higher index) than
 * the current `level` — and the doc already exists. Mirrors the `parent`
 * filterOptions (which restricts parents to strictly-higher levels), so a
 * same-or-higher level — never a valid child — stays hidden.
 */
const childLevelVisible =
  (childLevel: string) =>
  (data: Record<string, unknown>): boolean => {
    const current = REGION_LEVELS.indexOf(data?.level as string)
    const child = REGION_LEVELS.indexOf(childLevel)
    return hideUntilCreated(data) && current >= 0 && current < child
  }

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
    group: 'Classes',
    useAsTitle: 'name',
    defaultColumns: ['name', 'level'],
    groupBy: true,
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
              type: 'row',
              fields: [
                {
                  name: 'level',
                  type: 'select',
                  label: 'Type',
                  required: true,
                  defaultValue: 'country',
                  options: [...REGION_LEVEL_OPTIONS],
                  admin: {
                    components: { Field: '@/components/admin/ToggleGroupField' },
                  },
                },
                {
                  // The nested-docs plugin would otherwise inject `parent` into the
                  // sidebar with a default filter. Defining it here moves it into
                  // the main area and restricts it — the plugin reuses an existing
                  // `parent` field and keeps our `filterOptions`.
                  name: 'parent',
                  type: 'relationship',
                  relationTo: 'regions',
                  maxDepth: 1,
                  filterOptions: ({ data }) => {
                    const levels: string[] = REGION_LEVEL_OPTIONS.map((option) => option.value)
                    const currentIndex = levels.indexOf(data?.level as string)
                    // Parent must be a strictly higher level (closer to country);
                    // this also prevents cycles (no same-/lower-level parent).
                    if (currentIndex <= 0) return false
                    return { level: { in: levels.slice(0, currentIndex) } }
                  },
                  admin: {
                    // A country is the tree root, so it has no parent.
                    condition: (data) => data?.level !== 'country',
                    description: 'The geographic parent of this node (a higher level).',
                  },
                },
              ],
            },
            {
              // Owning side of Managers.managedRegions (a join on this field).
              // Populated by the Atlas `managed_records` import. Every region
              // needs an accountable manager, so this is required.
              name: 'managers',
              type: 'relationship',
              relationTo: 'managers',
              hasMany: true,
              required: true,
              admin: {
                description: 'Managers responsible for this region.',
              },
            },
            {
              name: 'mapboxId',
              type: 'text',
              label: 'Location',
              required: true,
              admin: {
                components: { Field: '@/components/admin/AddressSearchField' },
                custom: {
                  // Scope the search to what each level resolves to: a country,
                  // a region/state, a city, or a venue (POI/address). Read live
                  // off the `level` field by AddressSearchField.
                  searchTypesField: 'level',
                  searchTypesByValue: {
                    country: 'country',
                    region: 'region',
                    city: 'place,locality',
                    center: 'poi,address',
                  },
                  searchTypes: 'country,region,place,poi', // fallback if level unset
                  populateName: true,
                  allowManual: true,
                  // A country must be geocoded (no hand-entered coordinates).
                  allowManualByValue: { country: false },
                  placeholder: 'Search for location...',
                },
                description:
                  'Search for this place (country, region, city, or venue) to set its geographic identity, or "Enter manually" to provide your own coordinates.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'name',
                  type: 'text',
                  required: true,
                  // Only meaningful once a location is chosen — AddressSearchField
                  // populates the name from the picked place. Hidden (and, per the
                  // conditional-validation rule, not required / kept nullable) until
                  // `mapboxId` has any value, manual or a real Mapbox id.
                  admin: { condition: (data) => !!data?.mapboxId },
                },
                {
                  name: 'subtitle',
                  type: 'text',
                  admin: {
                    description: 'Text that appears below the region name in listings',
                    condition: (data) =>
                      ['city', 'center'].includes(data?.level as string) && !!data.name,
                  },
                },
              ],
            },
            {
              type: 'row',
              admin: { condition: isManualLocation },
              fields: [
                {
                  name: 'latitude',
                  type: 'number',
                  required: true,
                  admin: { condition: isManualLocation },
                },
                {
                  name: 'longitude',
                  type: 'number',
                  required: true,
                  admin: { condition: isManualLocation },
                },
                {
                  name: 'radius',
                  type: 'number',
                  required: true,
                  admin: { description: 'Radius in meters.', condition: isManualLocation },
                },
              ],
            },
          ],
        },
        {
          label: 'Events',
          fields: [
            {
              type: 'collapsible',
              label: 'Event Defaults',
              admin: { initCollapsed: false },
              fields: [
                {
                  name: 'eventDefaults',
                  type: 'group',
                  label: false,
                  admin: {
                    description:
                      'These fields will be used to set defaults for Events in this region',
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
            {
              name: 'events',
              type: 'join',
              collection: 'events',
              on: 'region',
              admin: { condition: hideUntilCreated },
            },
          ],
        },
        // Reverse side of `parent`, one tab per child level. A node can only
        // parent strictly-deeper levels (see the `parent` filterOptions), so each
        // tab is shown only once the doc exists AND its level is a valid child of
        // the current node — `childLevelVisible` (on the tab) folds both checks
        // together, and `where` filters the join to that single level. A center
        // (leaf) sees none of these tabs.
        {
          label: 'Regions',
          admin: { condition: childLevelVisible('region') },
          fields: [
            {
              name: 'childrenRegions',
              type: 'join',
              collection: 'regions',
              on: 'parent',
              where: { level: { equals: 'region' } },
              admin: { description: 'Region-level nodes nested directly beneath this one.' },
            },
          ],
        },
        {
          label: 'Cities',
          admin: { condition: childLevelVisible('city') },
          fields: [
            {
              name: 'childrenCities',
              type: 'join',
              collection: 'regions',
              on: 'parent',
              where: { level: { equals: 'city' } },
              admin: { description: 'Cities nested directly beneath this one.' },
            },
          ],
        },
        {
          label: 'Centers',
          admin: { condition: childLevelVisible('center') },
          fields: [
            {
              name: 'childrenCenters',
              type: 'join',
              collection: 'regions',
              on: 'parent',
              where: { level: { equals: 'center' } },
              admin: { description: 'SY Centers nested directly beneath this one.' },
            },
          ],
        },
      ],
    },
    // Breadcrumbs are populated by plugin-nested-docs. Defining the field here
    // (top-level, so the plugin reuses it instead of injecting its own) lets us
    // hide it — it's an internal denormalization, not something managers edit.
    createBreadcrumbsField('regions', { admin: { hidden: true } }),
    ...legacyMigrationFields(),
  ],
}
