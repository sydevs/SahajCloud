import type { CollectionConfig } from 'payload'

import { createBreadcrumbsField } from '@payloadcms/plugin-nested-docs'

import { hideUntilCreated, legacyMigrationFields, publicUrlFields, slugField } from '@/fields'
import { getRegionWebPaths } from '@/lib/atlas/regionWebPaths'
import { revalidateAtlasSidebarHook } from '@/lib/atlasSidebar/cache'
import { serverEnv } from '@/lib/env/server'
import { isManualMapboxId } from '@/lib/mapbox/manualLocation'
import { ownedRegionFilterOptions } from '@/plugins/access'

import { requireOwnedParentOnCreate } from './hooks/requireOwnedParentOnCreate'

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
 * One tab per child level: each holds a single `join` on the denormalized
 * `breadcrumbs` ancestor path (not `parent`), so it lists every descendant at
 * that level — not just direct children. Filtered to the level and shown only
 * when it's a valid child of the current node (`childLevelVisible`).
 * Country sees all three; a center (leaf) sees none.
 */
const CHILD_LEVEL_TABS = [
  {
    level: 'region',
    label: 'Regions',
    name: 'childrenRegions',
    description: 'Region-level nodes anywhere beneath this one.',
  },
  {
    level: 'city',
    label: 'Cities',
    name: 'childrenCities',
    description: 'Cities anywhere beneath this one.',
  },
  {
    level: 'center',
    label: 'Centers',
    name: 'childrenCenters',
    description: 'SY Centers anywhere beneath this one.',
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
  // The child joins below are recursive (all descendants via breadcrumbs.doc),
  // so skip them when a region is hydrated through a relationship (depth ≥ 1)
  // elsewhere — they render only in the single-doc edit view and have no
  // relationship/API consumer. Mirrors Meditations' `{ tagAssignments: false }`.
  defaultPopulate: {
    childrenRegions: false,
    childrenCities: false,
    childrenCenters: false,
  },
  hooks: {
    // Atlas managers can only create regions inside their owned subtree (a child
    // of a region they own) — block rootless creates the capability check must allow.
    beforeValidate: [requireOwnedParentOnCreate],
    // Bust the Atlas manager sidebar cache (region tree + counts) on any region write.
    afterChange: [revalidateAtlasSidebarHook],
    afterDelete: [revalidateAtlasSidebarHook],
  },
  fields: [
    {
      // Renders nothing; seeds level + parent from the URL when the Atlas
      // sidebar's "add child region" (+) links open the create form.
      name: 'createPrefill',
      type: 'ui',
      admin: { components: { Field: '@/components/admin/RegionCreatePrefill' } },
    },
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
                  filterOptions: async (args) => {
                    // Exactly one level up, except City (Country or Region) — see
                    // ALLOWED_PARENT_LEVELS. A Country (or unset level) has no
                    // valid parent. This also prevents cycles (never same/lower).
                    const allowed = ALLOWED_PARENT_LEVELS[args.data?.level as string]
                    if (!allowed) return false
                    // For an atlas-manager, also restrict to their owned subtree.
                    const levelFilter = { level: { in: allowed } }
                    const owned = await ownedRegionFilterOptions(args)
                    if (owned === true) return levelFilter
                    if (owned === false) return false
                    return { and: [levelFilter, owned] }
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
              name: 'events',
              type: 'join',
              collection: 'events',
              on: 'region',
              admin: { condition: hideUntilCreated },
            },
          ],
        },
        // Reverse side of the tree, one tab per child level (see CHILD_LEVEL_TABS).
        // Valid parents per level live in ALLOWED_PARENT_LEVELS, so each tab shows
        // only once the doc exists AND the current node is an allowed parent of
        // that level — `childLevelVisible` (on the tab) folds both checks together,
        // and `where` filters the join to that single level. A Country shows
        // Regions + Cities; a Region shows Cities; a City shows Centers; a center
        // (leaf) shows none.
        ...CHILD_LEVEL_TABS.map(({ level, label, name, description }) => {
          // Singular human label for the "New …" button (e.g. center → "SY Center").
          const levelLabel =
            REGION_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? label
          return {
            label,
            admin: { condition: childLevelVisible(level) },
            fields: [
              {
                // "New <Level>" link above the table, pre-filled with the right level +
                // parent via the create-page query params RegionCreatePrefill reads (the
                // recursive join can't carry that through its native, disabled "Add New").
                name: `${name}Add`,
                type: 'ui' as const,
                admin: {
                  custom: { childLevel: level, levelLabel },
                  components: { Field: '@/components/admin/AddChildRegionButton' },
                },
              },
              {
                name,
                // The tab already names it (Regions/Cities/Centers); the field's own
                // "Children …" heading is redundant, so suppress it.
                label: false as const,
                type: 'join' as const,
                collection: 'regions' as const,
                // Join on the denormalized ancestor path, not `parent`: a join is a
                // single reverse-lookup, so `on: 'parent'` returns only direct
                // children. Every node's breadcrumb trail holds all of its ancestors
                // (root → self), so a `breadcrumbs.doc` matching this node selects
                // every descendant at any depth. The per-level `where` scopes each tab
                // to one level. Self-exclusion comes not from the `where` alone but
                // from `childLevelVisible` (the tab condition): it shows a tab only
                // when the node's level is a strict ancestor of `level`, so the node's
                // own row (at the node's level) never matches the filter. Read outside
                // that gating, the bare field would include a same-level node — moot,
                // as these fields have no API consumer. (Payload's sanitizer supports a
                // relationship nested in a localized array and auto-indexes the column
                // — see sanitizeJoinField.)
                on: 'breadcrumbs.doc',
                where: { level: { equals: level } },
                // Result sets are larger now (all descendants), so paginate.
                defaultLimit: 50,
                admin: {
                  // Native "Add New" seeds the `on` field (breadcrumbs.doc) — useless
                  // here — so hide it; the AddChildRegionButton above replaces it with
                  // a level + parent-prefilled create link.
                  allowCreate: false,
                  // `level` is constant within a tab (filtered above), so surface
                  // `parent` instead — it shows where each descendant sits.
                  defaultColumns: ['name', 'parent'],
                  description,
                },
              },
            ],
          }
        }),
      ],
    },
    // Stable, URL-friendly identity for Sahaj Atlas routing — a region otherwise
    // exposes only an opaque `mapboxId` and a display `name`. Required, unique +
    // indexed (hardcoded by the helper); `collectionSlug` adds app-layer
    // uniqueness validation. A handful of regions share a `name` across the tree
    // (e.g. Georgia the country vs. the US state), so the Atlas importer assigns
    // collision-free slugs rather than the bare `name`.
    slugField({
      useAsSlug: 'name',
      collectionSlug: 'regions',
      description: 'Stable identifier for Atlas routing (auto-generated from {sourceField}).',
      overrides: (field) => {
        // generateSlug defaults OFF for regions. The slugField default slugify now
        // transliterates non-Latin names (Москва → "moskva"), so this isn't about
        // empty slugs — it's that the importer assigns *disambiguated* slugs for
        // the duplicate names (Georgia the country vs. the US state →
        // `georgia` / `georgia-united-states`), and an on-by-default checkbox would
        // rewrite those back to the bare, colliding `slugify(name)` on any save —
        // including the nested-docs breadcrumb cascade that re-saves descendants.
        // New regions still get an auto-slug: the create hook fills it from `name`
        // (transliterated) regardless of the checkbox. Off also keeps the column
        // default off, so the production backfill of existing rows stays cascade-safe.
        if (field.fields[0].type === 'checkbox') field.fields[0].defaultValue = false
        return field
      },
    }),
    // Breadcrumbs are populated by plugin-nested-docs. Defining the field here
    // (top-level, so the plugin reuses it instead of injecting its own) lets us
    // hide it — it's an internal denormalization, not something managers edit.
    //
    // `localized: false` overrides the plugin's localized-by-default. Region
    // `name` (the breadcrumb label) isn't localized, so the trail is identical
    // in every locale; keeping it localized partitions it per-locale and breaks
    // any reverse-lookup on `breadcrumbs.doc` in a locale where the trail wasn't
    // written — the recursive child joins above return nothing, and the
    // document-manager descendant query (documentManagers.ts) resolves zero
    // descendants. Non-localized makes this one denormalized path locale-stable.
    // (The joins key on `doc` id, which is locale-invariant; if `name` ever
    // becomes localized, only the hidden breadcrumb labels would go stale.)
    createBreadcrumbsField('regions', { localized: false, admin: { hidden: true } }),
    // Canonical Atlas web path/URL — the ordered ancestor slug chain including
    // this region (`/belgium/flanders/antwerp`), built from the breadcrumbs
    // above. Region-optional and venue-optional shapes collapse naturally
    // because they reflect actual ancestry. Regions have no `_status`, so
    // `requirePublished: false` exposes `webPath` + `webUrl` (`appUrl` is null —
    // no Atlas app deep-link).
    ...publicUrlFields({
      web: serverEnv.SAHAJATLAS_URL,
      buildPath: async ({ data, req }) => {
        const id = data?.id
        if (typeof id !== 'number') return null
        const paths = await getRegionWebPaths(req)
        return paths.get(id) ?? null
      },
      requirePublished: false,
    }),
    ...legacyMigrationFields(),
  ],
}
