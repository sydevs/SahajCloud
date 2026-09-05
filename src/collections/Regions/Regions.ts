import type { CollectionConfig } from 'payload'

import { createBreadcrumbsField } from '@payloadcms/plugin-nested-docs'

import { hideUntilCreated, legacyMigrationFields, publicUrlFields, slugField } from '@/fields'
import { getCanonicalUrlBase } from '@/lib/atlas/regionOwners'
import { getRegionWebPaths } from '@/lib/atlas/regionTree'
import { revalidateAtlasSidebarHook } from '@/lib/atlasSidebar/cache'
import { serverEnv } from '@/lib/env/server'
import { isManualMapboxId } from '@/lib/mapbox/manualLocation'
import { ownedRegionFilterOptions } from '@/plugins/access'

import { requireOwnedParentOnCreate } from './hooks/requireOwnedParentOnCreate'
import { withNonEmptySlug } from './nonEmptySlug'

/**
 * The four geo levels of the Atlas region tree. Country, Region, and Area
 * form the administrative hierarchy. `venue` is a shared venue: a place
 * referenced by more than one event. A single-use venue is folded into the
 * event's own address instead.
 */
export const REGION_LEVEL_OPTIONS = [
  { label: 'Country', value: 'country' },
  { label: 'Region', value: 'region' },
  { label: 'City', value: 'city' },
  { label: 'Venue', value: 'venue' },
] as const

/**
 * Manual coordinates apply only to nodes whose location was entered by
 * hand: a `manual`-prefixed `mapboxId` (see isManualMapboxId). A
 * Mapbox-identified node resolves geometry from its id downstream. This is
 * used as each coordinate field's own `condition`, so Payload keeps the
 * columns nullable — the field is `required` only when visible. A
 * `required` field with no condition of its own would force a NOT NULL
 * column, and reject every Mapbox-identified region.
 */
const isManualLocation = (data: Record<string, unknown>): boolean =>
  isManualMapboxId(data?.mapboxId)

/**
 * Which levels may be a node's direct parent. A node nests exactly one level
 * up, except a City. A City may sit under a Region, or directly under a
 * Country, skipping the optional Region. A Country is the tree root, with no
 * parent. This is the single source of truth for both the `parent` picker
 * (filterOptions) and the reverse per-level children tabs (childLevelVisible).
 */
const ALLOWED_PARENT_LEVELS: Record<string, string[]> = {
  region: ['country'],
  city: ['country', 'region'],
  venue: ['city'],
}

/**
 * Condition for a per-level `children` join. It shows the tab only once the
 * document exists, and only when the current node's level is an allowed
 * parent of `childLevel` (the inverse of ALLOWED_PARENT_LEVELS). So the
 * Venues tab appears only under a City, never a Country or Region, and a
 * venue (a leaf) shows no child tabs at all.
 */
const childLevelVisible = (childLevel: string) => {
  const parentLevels: string[] = ALLOWED_PARENT_LEVELS[childLevel] ?? []
  return (data: Record<string, unknown>): boolean =>
    hideUntilCreated(data) && parentLevels.includes(data?.level as string)
}

/**
 * One tab per child level. Each holds a single `join` on the denormalized
 * `breadcrumbs` ancestor path, not `parent`, so it lists every descendant at
 * that level, not just direct children. It is filtered to the level, and
 * shown only when it is a valid child of the current node
 * (`childLevelVisible`). A Country sees all three tabs. A venue (a leaf)
 * sees none.
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
    level: 'venue',
    label: 'Venues',
    name: 'childrenVenues',
    description: 'Venues anywhere beneath this one.',
  },
] as const

/**
 * Regions: the nested Sahaj Atlas geo tree. `@payloadcms/plugin-nested-docs`
 * injects `parent` and `breadcrumbs` (configured in payload.config.ts). All
 * fields apply uniformly to every level, venues included.
 */
export const Regions: CollectionConfig = {
  slug: 'regions',
  labels: { singular: 'Region', plural: 'Regions' },
  admin: {
    group: 'Classes',
    useAsTitle: 'name',
    defaultColumns: ['name', 'level'],
    groupBy: true,
    // Live Preview loads the Atlas widget's /preview route (same contract as
    // Events — see Events.ts for the CORS and draft-unlock notes). Regions
    // have no drafts. The preview shows published data, plus unsaved form
    // edits streamed through Payload's postMessage sender.
    livePreview: {
      // An unsaved document has nothing to fetch yet. Returning null disables the panel.
      url: ({ data, locale }) =>
        data.id
          ? `${serverEnv.SAHAJATLAS_URL}/preview?collection=regions&id=${data.id}&secret=${serverEnv.SAHAJCLOUD_PREVIEW_SECRET}&locale=${locale.code}`
          : null,
      breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
    },
  },
  // The child joins below are recursive, over all descendants via
  // breadcrumbs.doc. So skip them when a region is hydrated through a
  // relationship (depth 1 or more) elsewhere. They render only in the
  // single-document edit view, and have no relationship or API consumer.
  // This mirrors Meditations' `{ tagAssignments: false }`.
  defaultPopulate: {
    childrenRegions: false,
    childrenCities: false,
    childrenVenues: false,
  },
  hooks: {
    // Atlas managers can create regions only inside their owned subtree, a
    // child of a region they own. This blocks rootless creates that the
    // capability check must allow.
    beforeValidate: [requireOwnedParentOnCreate],
    // Clear the Atlas manager sidebar cache (region tree and counts) on any
    // region write.
    afterChange: [revalidateAtlasSidebarHook],
    afterDelete: [revalidateAtlasSidebarHook],
  },
  fields: [
    {
      // Renders nothing. It seeds level and parent from the URL when the
      // Atlas sidebar's "add child region" (+) links open the create form.
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
                    // Per-value help text, rendered by ToggleGroupField's
                    // embedded SelectDescription (reads admin.custom.descriptions).
                    custom: {
                      descriptions: {
                        country: 'A country — the root of the geographic tree.',
                        region: 'A state, province, or other sub-national region.',
                        city: 'A city or town.',
                        venue:
                          'A place that hosts more than one class — a shared venue, whether a Sahaja Yoga centre or a library that lends its hall. (A venue used by a single event belongs in that event’s own address instead.)',
                      },
                    },
                  },
                },
                {
                  // Without this, the nested-docs plugin injects `parent`
                  // into the sidebar with a default filter. Defining it here
                  // moves it into the main area, and restricts it. The
                  // plugin reuses an existing `parent` field, and keeps this
                  // `filterOptions`.
                  name: 'parent',
                  type: 'relationship',
                  relationTo: 'regions',
                  maxDepth: 1,
                  filterOptions: async (args) => {
                    // Exactly one level up, except City (Country or Region).
                    // See ALLOWED_PARENT_LEVELS. A Country, or an unset
                    // level, has no valid parent. This also prevents cycles:
                    // a parent is never the same level or lower.
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
              // The owning side of Managers.managedRegions, a join on this
              // field. The Atlas `managed_records` import populates it.
              // Optional: most Atlas regions have no manager on file, so
              // requiring it would block the import. Managers are assigned
              // where they exist.
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
              // A real Mapbox feature id identifies exactly one region.
              // Manual locations also satisfy this: each gets a unique
              // `manual-<id>` (the admin generates a uuid, and the importer
              // a per-node key), so the bare shared `'manual'` sentinel is
              // never written here.
              unique: true,
              admin: {
                components: { Field: '@/components/admin/AddressSearchField' },
                custom: {
                  // Scope the search to what each level resolves to: a
                  // country, a region or state, a city, or a venue (POI or
                  // address). AddressSearchField reads this live off the
                  // `level` field.
                  searchTypesField: 'level',
                  searchTypesByValue: {
                    country: 'country',
                    region: 'region',
                    city: 'place,locality',
                    venue: 'poi,address',
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
                  // Only meaningful once a location is chosen. AddressSearchField
                  // populates the name from the picked place. Hidden, and — per
                  // the conditional-validation rule — not required and kept
                  // nullable, until `mapboxId` has any value, manual or a real
                  // Mapbox id.
                  admin: { condition: (data) => !!data?.mapboxId },
                },
                {
                  name: 'subtitle',
                  type: 'text',
                  admin: {
                    description: 'Text that appears below the region name in listings',
                    condition: (data) =>
                      ['city', 'venue'].includes(data?.level as string) && !!data.name,
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
        // Reverse side of the tree, one tab per child level (see
        // CHILD_LEVEL_TABS). Valid parents per level live in
        // ALLOWED_PARENT_LEVELS, so each tab shows only once the document
        // exists AND the current node is an allowed parent of that level.
        // `childLevelVisible` (on the tab) folds both checks together, and
        // `where` filters the join to that single level. A Country shows
        // Regions and Cities. A Region shows Cities. A City shows Venues. A
        // venue (a leaf) shows none.
        ...CHILD_LEVEL_TABS.map(({ level, label, name, description }) => {
          // Singular human label for the "New …" button, for example venue → "Venue".
          const levelLabel =
            REGION_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? label
          return {
            label,
            admin: { condition: childLevelVisible(level) },
            fields: [
              {
                // A "New <Level>" link above the table, pre-filled with the
                // right level and parent, through the create-page query
                // params RegionCreatePrefill reads. The recursive join
                // cannot carry that through its native, disabled "Add New".
                name: `${name}Add`,
                type: 'ui' as const,
                admin: {
                  custom: { childLevel: level, levelLabel },
                  components: { Field: '@/components/admin/AddChildRegionButton' },
                },
              },
              {
                name,
                // The tab already names it (Regions, Cities, or Venues). The
                // field's own "Children …" heading is redundant, so suppress it.
                label: false as const,
                type: 'join' as const,
                collection: 'regions' as const,
                // Join on the denormalized ancestor path, not `parent`. A
                // join is a single reverse-lookup, so `on: 'parent'` would
                // return only direct children. Every node's breadcrumb trail
                // holds all of its ancestors, from root to self, so a
                // `breadcrumbs.doc` match on this node selects every
                // descendant at any depth. The per-level `where` scopes each
                // tab to one level. Self-exclusion does not come from
                // `where` alone. It also comes from `childLevelVisible`, the
                // tab condition: it shows a tab only when the node's level
                // is a strict ancestor of `level`, so the node's own row, at
                // the node's own level, never matches the filter. Read
                // outside that gating, the bare field would include a
                // same-level node — moot, since these fields have no API
                // consumer. (Payload's sanitizer supports a relationship
                // nested in a localized array, and auto-indexes the column.
                // See sanitizeJoinField.)
                on: 'breadcrumbs.doc',
                where: { level: { equals: level } },
                // Result sets are larger now (all descendants), so paginate.
                defaultLimit: 50,
                admin: {
                  // The native "Add New" button seeds the `on` field
                  // (breadcrumbs.doc), which is useless here, so hide it.
                  // The AddChildRegionButton above replaces it with a level-
                  // and parent-prefilled create link.
                  allowCreate: false,
                  // `level` is constant within a tab, filtered above, so
                  // surface `parent` instead. It shows where each
                  // descendant sits.
                  defaultColumns: ['name', 'parent'],
                  description,
                },
              },
            ],
          }
        }),
      ],
    },
    // A stable, URL-friendly identity for Sahaj Atlas routing. Without it, a
    // region exposes only an opaque `mapboxId` and a display `name`.
    // Required, unique, and indexed, all hardcoded by the helper.
    // `collectionSlug` adds app-layer uniqueness validation. A handful of
    // regions share a `name` across the tree (for example Georgia the
    // country versus the US state), so the Atlas importer assigns
    // collision-free slugs, instead of the bare `name`.
    slugField({
      useAsSlug: 'name',
      collectionSlug: 'regions',
      description: 'Stable identifier for Atlas routing (auto-generated from {sourceField}).',
      overrides: (field) => {
        // generateSlug defaults OFF for regions. The slugField default
        // slugify now transliterates non-Latin names (Москва → "moskva"), so
        // this is not about empty slugs. The importer assigns
        // *disambiguated* slugs for duplicate names (Georgia the country
        // versus the US state → `georgia` / `georgia-united-states`), and an
        // on-by-default checkbox would rewrite those back to the bare,
        // colliding `slugify(name)` on any save, including the nested-docs
        // breadcrumb cascade that re-saves descendants. New regions still
        // get an auto-slug: the create hook fills it from `name`
        // (transliterated), regardless of the checkbox. Off also keeps the
        // column default off, so the production backfill of existing rows
        // stays cascade-safe.
        if (field.fields[0].type === 'checkbox') field.fields[0].defaultValue = false
        // Refuse a *newly* blank slug: it is one segment of every canonical
        // URL in the subtree below this region. This wraps, rather than
        // replaces, the uniqueness validator the factory just installed. See
        // withNonEmptySlug for why this is a validator, not a collection hook.
        if (field.fields[1].type === 'text') {
          field.fields[1].validate = withNonEmptySlug(field.fields[1].validate)
        }
        return field
      },
    }),
    // plugin-nested-docs populates breadcrumbs. Defining the field here, at
    // the top level, makes the plugin reuse it instead of injecting its own,
    // which lets us hide it. It is an internal denormalization, not
    // something managers edit.
    //
    // `localized: false` overrides the plugin's localized-by-default. Region
    // `name` (the breadcrumb label) is not localized, so the trail is
    // identical in every locale. Keeping it localized would partition it
    // per locale, and break any reverse-lookup on `breadcrumbs.doc` in a
    // locale where the trail was not written. The recursive child joins
    // above would return nothing, and the document-manager descendant query
    // (documentManagers.ts) would resolve zero descendants. Non-localized
    // makes this one denormalized path locale-stable. (The joins key on
    // `doc` id, which is locale-invariant. If `name` ever becomes localized,
    // only the hidden breadcrumb labels would go stale.)
    createBreadcrumbsField('regions', { localized: false, admin: { hidden: true } }),
    // The canonical Atlas web path and URL: the ordered ancestor slug chain
    // that includes this region (`/belgium/flanders/antwerp`), built from
    // the breadcrumbs above. Region-optional and venue-optional shapes
    // collapse naturally, because they reflect actual ancestry. Regions have
    // no `_status`, so `requirePublished: false` exposes `webPath` and
    // `webUrl`. (`appUrl` is null. There is no Atlas app deep-link.)
    ...publicUrlFields({
      // Per-region base (#634): the client that owns this region, or its
      // nearest owning ancestor, on its own domain, falling back to the We
      // Meditate surface. Not `SAHAJATLAS_URL`, which is `noindex` by policy.
      web: ({ data, req }) =>
        getCanonicalUrlBase(req, typeof data?.id === 'number' ? data.id : null),
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
