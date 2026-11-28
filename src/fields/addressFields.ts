import type { Field, GroupField } from 'payload'

/** Text-backed searchable dropdown, so `country` and `region` need no Postgres enum. */
const STRING_SELECT_FIELD = '@/components/admin/StringSelectField'
/** Bound to the `mapboxId` field. */
const ADDRESS_SEARCH_FIELD = '@/components/admin/AddressSearchField'

export interface AddressFieldsOptions {
  /** Default `address`. */
  name?: string
  /** Default: derived "Address"; `false` hides it. */
  label?: false | string
  /** The sub-fields to mark required, e.g. `['street', 'city', 'country']`. */
  required?: string[]
  /** Default true. */
  hasRoom?: boolean
  /**
   * The building's own name ("Broadstairs Friends Meeting House"), which a
   * street address does not convey. Distinct from `room`: that says where
   * *inside* the building to go.
   */
  hasVenueName?: boolean
  /** Default true. */
  hasCoordinates?: boolean
  /**
   * A Mapbox address-search field (`mapboxId`) above the inputs. Default true,
   * and it degrades to manual entry with no Mapbox token configured.
   */
  hasGeocoding?: boolean
  admin?: Partial<GroupField['admin']>
}

/**
 * A postal-address group. `country` and `region` store ISO codes — alpha-2 for
 * `country` (`US`), ISO 3166-2 subdivision shortCode for `region` (`CA`) — and
 * `region` cascades from the selected country.
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
    hasVenueName = false,
    hasCoordinates = true,
    hasGeocoding = true,
    admin = {},
  } = options

  const isRequired = (fieldName: string) => required.includes(fieldName)

  // With geocoding on, every other field waits for `mapboxId` — set by a chosen
  // result, or by the search field's "Enter manually".
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
                custom: {
                  // Nothing coarser than a street: `populateAddress` writes the
                  // picked feature into the sibling `street`, and the CSV
                  // importer stores this same column only for an `address`
                  // match (`addressFeatureMapboxId`,
                  // `src/plugins/eventImport/eventData.ts`).
                  searchTypes: 'address,street',
                  populateAddress: true,
                  allowManual: true,
                },
              },
            },
          ]
        : []),
      ...(hasVenueName
        ? [
            {
              name: 'venueName',
              type: 'text' as const,
              label: 'Venue Name',
              maxLength: 100,
              required: isRequired('venueName'),
              admin: {
                placeholder: 'e.g. Broadstairs Friends Meeting House (optional)',
                description:
                  "The building's own name, where it has one. Shown in place of the street when a listing has no title of its own.",
                ...revealOnSearch,
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
                    placeholder: 'Which room do seekers go to? (optional)',
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
