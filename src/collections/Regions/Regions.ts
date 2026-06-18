import type { CollectionConfig } from 'payload'

import { createBreadcrumbsField } from '@payloadcms/plugin-nested-docs'

import { hideUntilCreated, legacyMigrationFields, slugField } from '@/fields'
import { getLanguageOptions } from '@/lib/locales'
import { isManualMapboxId } from '@/lib/mapbox/manualLocation'
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
 * (a `manual`-prefixed `mapboxId` — see isManualMapboxId); a Mapbox-identified
 * node resolves geometry from its id downstream. Used as each coordinate field's
 * own `condition` so that — being `required` only when visible — Payload keeps the
 * columns nullable (a `required` field with no own condition would force a NOT
 * NULL column and reject every Mapbox-identified region).
 */
const isManualLocation = (data: Record<string, unknown>): boolean =>
  isManualMapboxId(data?.mapboxId)

/**
 * Which levels may be a node's direct parent. A node nests exactly one level up,
 * except a City, which may sit under a Region or — skipping the optional Region —
 * directly under a Country. A Country is the tree root (no parent). Single source
 * of truth for both the `parent` picker (filterOptions) and the reverse per-level
 * children tabs (childLevelVisible).
 */
const ALLOWED_PARENT_LEVELS: Record<string, string[]> = {
  region: ['country'],
  city: ['country', 'region'],
  center: ['city'],
}

/**
 * Condition for a per-level `children` join: show it only once the doc exists and
 * the current node's level is an allowed parent of `childLevel` (the inverse of
 * ALLOWED_PARENT_LEVELS) — so the Centers tab appears only under a City, never a
 * Country/Region, and a center (a leaf) shows no child tabs at all.
 */
const childLevelVisible = (childLevel: string) => {
  const parentLevels: string[] = ALLOWED_PARENT_LEVELS[childLevel] ?? []
  return (data: Record<string, unknown>): boolean =>
    hideUntilCreated(data) && parentLevels.includes(data?.level as string)
}

/**
 * One tab per child level: each holds a single `join` filtered to that level,
 * shown only when it's a valid child of the current node (`childLevelVisible`).
 * Country sees all three; a center (leaf) sees none.
 */
const CHILD_LEVEL_TABS = [
  {
    level: 'region',
    label: 'Regions',
    name: 'childrenRegions',
    description: 'Region-level nodes nested directly beneath this one.',
  },
  {
    level: 'city',
    label: 'Cities',
    name: 'childrenCities',
    description: 'Cities nested directly beneath this one.',
  },
  {
    level: 'center',
    label: 'Centers',
    name: 'childrenCenters',
    description: 'SY Centers nested directly beneath this one.',
  },
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
                    // Per-value help text — rendered by ToggleGroupField's
                    // embedded SelectDescription (reads admin.custom.descriptions).
                    custom: {
                      descriptions: {
                        country: 'A country — the root of the geographic tree.',
                        region: 'A state, province, or other sub-national region.',
                        city: 'A city or town.',
                        center:
                          'A Sahaja Yoga Center that holds multiple classes — a venue shared by more than one event. (Single-use venues belong in the event’s own address instead.)',
                      },
                    },
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
                    // Exactly one level up, except City (Country or Region) — see
                    // ALLOWED_PARENT_LEVELS. A Country (or unset level) has no
                    // valid parent. This also prevents cycles (never same/lower).
                    const allowed = ALLOWED_PARENT_LEVELS[data?.level as string]
                    return allowed ? { level: { in: allowed } } : false
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
              // Populated by the Atlas `managed_records` import. Optional: most
              // Atlas regions have no manager on file, so requiring it would block
              // the import — managers are assigned where they exist.
              name: 'managers',
              type: 'relationship',
              relationTo: 'managers',
              hasMany: true,
              admin: {
                description: 'Managers responsible for this region.',
              },
            },
            {
              name: 'mapboxId',
              type: 'text',
              label: 'Location',
              required: true,
              // A real Mapbox feature id identifies exactly one region. Manual
              // locations also satisfy this — each is given a unique `manual-<id>`
              // (the admin generates a uuid; the importer a per-node key), so the
              // bare shared `'manual'` sentinel is never written here.
              unique: true,
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
        // Reverse side of `parent`, one tab per child level (see CHILD_LEVEL_TABS).
        // Valid parents per level live in ALLOWED_PARENT_LEVELS, so each tab shows
        // only once the doc exists AND the current node is an allowed parent of
        // that level — `childLevelVisible` (on the tab) folds both checks together,
        // and `where` filters the join to that single level. A Country shows
        // Regions + Cities; a Region shows Cities; a City shows Centers; a center
        // (leaf) shows none.
        ...CHILD_LEVEL_TABS.map(({ level, label, name, description }) => ({
          label,
          admin: { condition: childLevelVisible(level) },
          fields: [
            {
              name,
              type: 'join' as const,
              collection: 'regions' as const,
              on: 'parent',
              where: { level: { equals: level } },
              admin: { description },
            },
          ],
        })),
      ],
    },
    // Stable, URL-friendly identity for Sahaj Atlas routing — a region otherwise
    // exposes only an opaque `mapboxId` and a display `name`. Unique + indexed
    // (hardcoded by the helper); `collectionSlug` adds app-layer uniqueness
    // validation. A handful of regions share a `name` across the tree (e.g.
    // Georgia the country vs. the US state), so the Atlas importer assigns
    // collision-free slugs rather than relying on the bare `name`.
    slugField({
      useAsSlug: 'name',
      collectionSlug: 'regions',
      description: 'Stable identifier for Atlas routing (auto-generated from {sourceField}).',
      // Nullable column on purpose: `regions` predates this field, so the
      // generated migration adds it nullable (Postgres allows many NULLs under a
      // unique index) and the Atlas importer backfills existing rows — no
      // hand-edited NOT NULL backfill. New rows still get a slug from the
      // `generateSlug` checkbox; the helper's built-in `required: true` would
      // instead emit a NOT NULL column the populated table can't satisfy.
      overrides: (field) => {
        if (field.fields[1].type === 'text') field.fields[1].required = false
        return field
      },
    }),
    // Breadcrumbs are populated by plugin-nested-docs. Defining the field here
    // (top-level, so the plugin reuses it instead of injecting its own) lets us
    // hide it — it's an internal denormalization, not something managers edit.
    createBreadcrumbsField('regions', { admin: { hidden: true } }),
    ...legacyMigrationFields(),
  ],
}
