import type { Field, GroupField } from 'payload'

/** Text-backed searchable dropdown component (country + region), see src/components/admin/StringSelectField. */
const STRING_SELECT_FIELD = '@/components/admin/StringSelectField'

export interface AddressFieldsOptions {
  /** Group field name (default: 'address') */
  name?: string
  /** Group label (default: derived "Address"; pass false to hide) */
  label?: false | string
  /** Make the core fields (street, city, country) required (default: false) */
  required?: boolean
  /** Include the `room` field (default: true) */
  hasRoom?: boolean
  /** Include `latitude` / `longitude` (default: true) */
  hasCoordinates?: boolean
  /** Admin overrides — notably `condition` (e.g. show only for offline events) */
  admin?: Partial<GroupField['admin']>
}

/**
 * Reusable postal-address group. `country` and `region` are searchable
 * dropdowns backed by plain `text` columns (no Postgres enum) via
 * `StringSelectField`: `country` lists all countries; `region` cascades from
 * the selected country (disabled until one is chosen). Values are ISO codes —
 * alpha-2 for `country` (e.g. `US`), ISO 3166-2 subdivision shortCode for
 * `region` (e.g. `CA`). Companion of `scheduleFields`.
 *
 * @example
 * addressFields({ admin: { condition: (data) => data?.eventType === 'offline' } })
 */
export function addressFields(options: AddressFieldsOptions = {}): Field {
  const {
    name = 'address',
    label,
    required = false,
    hasRoom = true,
    hasCoordinates = true,
    admin = {},
  } = options

  const group: GroupField = {
    name,
    type: 'group',
    ...(label !== undefined ? { label } : {}),
    admin: { ...admin },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'street',
            type: 'text',
            label: 'Street Address',
            required,
            admin: { width: '70%' },
          },
          ...(hasRoom
            ? [
                {
                  name: 'room',
                  type: 'text' as const,
                  admin: { width: '30%', description: 'Room or floor within the venue, if any.' },
                },
              ]
            : []),
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'city', type: 'text', required, admin: { width: '50%' } },
          { name: 'postCode', type: 'text', label: 'Postal Code', admin: { width: '50%' } },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            name: 'country',
            type: 'text',
            required,
            admin: {
              width: '50%',
              components: { Field: STRING_SELECT_FIELD },
              custom: { source: 'country' },
            },
          },
          {
            name: 'region',
            type: 'text',
            label: 'Region / State / Province',
            admin: {
              width: '50%',
              components: { Field: STRING_SELECT_FIELD },
              custom: { source: 'region', dependsOn: 'country' },
            },
          },
        ],
      },
      ...(hasCoordinates
        ? [
            {
              type: 'row' as const,
              fields: [
                { name: 'latitude', type: 'number' as const, admin: { width: '50%' } },
                { name: 'longitude', type: 'number' as const, admin: { width: '50%' } },
              ],
            },
          ]
        : []),
    ],
  }

  return group
}
