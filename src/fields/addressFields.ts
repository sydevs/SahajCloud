import type { Field, GroupField } from 'payload'

/** Text-backed searchable dropdown component (country + region), see src/components/admin/StringSelectField. */
const STRING_SELECT_FIELD = '@/components/admin/StringSelectField'
/** Mapbox address-search component, bound to the `mapboxId` field. */
const ADDRESS_SEARCH_FIELD = '@/components/admin/AddressSearchField'

export interface AddressFieldsOptions {
  /** Group field name (default: 'address') */
  name?: string
  /** Group label (default: derived "Address"; pass false to hide) */
  label?: false | string
  /** Field names to mark required (e.g. `['street', 'city', 'country']`). Default: none. */
  required?: string[]
  /** Include the `room` field (default: true) */
  hasRoom?: boolean
  /** Include `latitude` / `longitude` (default: true) */
  hasCoordinates?: boolean
  /**
   * Add a Mapbox address-search field (`mapboxId`) above the inputs (default:
   * true). Selecting a result stores the Mapbox feature id and auto-fills the
   * fields; the detail fields stay hidden until `mapboxId` is set (by a search
   * result, or the search field's "Enter manually" option). Degrades to manual
   * entry when no Mapbox token is configured.
   */
  hasGeocoding?: boolean
  /** Admin overrides — notably `condition` (e.g. show only for offline events) */
  admin?: Partial<GroupField['admin']>
}

/**
 * Reusable postal-address group. `country` and `region` are searchable
 * dropdowns backed by plain `text` columns (no Postgres enum) via
 * `StringSelectField`: `country` lists all countries; `region` cascades from
 * the selected country (disabled until one is chosen). Values are ISO codes —
 * alpha-2 for `country` (e.g. `US`), ISO 3166-2 subdivision shortCode for
 * `region` (e.g. `CA`). With `hasGeocoding`, a Mapbox search field (`mapboxId`)
 * above the inputs auto-fills them. Companion of `scheduleFields`.
 *
 * @example
 * addressFields({
 *   required: ['street', 'city', 'country', 'latitude', 'longitude'],
 *   admin: { condition: (data) => data?.eventType === 'offline' },
 * })
 */
export function addressFields(options: AddressFieldsOptions = {}): Field {
  const {
    name = 'address',
    label,
    required = [],
    hasRoom = true,
    hasCoordinates = true,
    hasGeocoding = true,
    admin = {},
  } = options

  const isRequired = (fieldName: string) => required.includes(fieldName)

  // With geocoding on, the address starts as just the search field; every other
  // field appears once `mapboxId` is set (a chosen result, or "Enter manually").
  const revealOnSearch: {
    condition?: (data: Record<string, unknown>, siblingData: Record<string, unknown>) => boolean
  } = hasGeocoding ? { condition: (_data, siblingData) => Boolean(siblingData?.mapboxId) } : {}

  const group: GroupField = {
    name,
    type: 'group',
    ...(label !== undefined ? { label } : {}),
    admin: { ...admin },
    fields: [
      ...(hasGeocoding
        ? [
            {
              name: 'mapboxId',
              type: 'text' as const,
              label: 'Address',
              admin: {
                components: { Field: ADDRESS_SEARCH_FIELD },
                custom: { searchTypes: 'address,poi', populateAddress: true },
              },
            },
          ]
        : []),
      {
        type: 'row',
        fields: [
          {
            name: 'street',
            type: 'text',
            label: 'Street Address',
            required: isRequired('street'),
            admin: { ...revealOnSearch },
          },
          ...(hasRoom
            ? [
                {
                  name: 'room',
                  type: 'text' as const,
                  maxLength: 100,
                  required: isRequired('room'),
                  admin: {
                    description: 'Room or floor within the venue, if any.',
                    ...revealOnSearch,
                  },
                },
              ]
            : []),
          {
            name: 'postCode',
            type: 'text',
            label: 'Postal Code',
            required: isRequired('postCode'),
            admin: { width: '25%', ...revealOnSearch },
          },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            name: 'country',
            type: 'text',
            required: isRequired('country'),
            admin: {
              components: { Field: STRING_SELECT_FIELD },
              custom: { source: 'country' },
              ...revealOnSearch,
            },
          },
          {
            name: 'region',
            type: 'text',
            label: 'Region / State / Province',
            required: isRequired('region'),
            admin: {
              components: { Field: STRING_SELECT_FIELD },
              custom: { source: 'region', dependsOn: 'country' },
              ...revealOnSearch,
            },
          },
          {
            name: 'city',
            type: 'text',
            required: isRequired('city'),
            admin: { ...revealOnSearch },
          },
        ],
      },
      ...(hasCoordinates
        ? [
            {
              type: 'row' as const,
              fields: [
                {
                  name: 'latitude',
                  type: 'number' as const,
                  required: isRequired('latitude'),
                  admin: { width: '50%', ...revealOnSearch },
                },
                {
                  name: 'longitude',
                  type: 'number' as const,
                  required: isRequired('longitude'),
                  admin: { width: '50%', ...revealOnSearch },
                },
              ],
            },
          ]
        : []),
    ],
  }

  return group
}
