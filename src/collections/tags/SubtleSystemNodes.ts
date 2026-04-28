import type { CollectionConfig } from 'payload'

/**
 * The closed set of 12 subtle-system nodes (chakras + nadis).
 * The migration that creates `subtle_system_nodes` seeds exactly these slugs;
 * adding/removing entries requires both a code change and a new migration.
 */
export const SUBTLE_SYSTEM_NODE_OPTIONS = [
  { label: 'Mooladhara', value: 'mooladhara' },
  { label: 'Swadhistan', value: 'swadhistan' },
  { label: 'Nabhi', value: 'nabhi' },
  { label: 'Void', value: 'void' },
  { label: 'Anahat', value: 'anahat' },
  { label: 'Vishuddhi', value: 'vishuddhi' },
  { label: 'Agnya', value: 'agnya' },
  { label: 'Sahasrara', value: 'sahasrara' },
  { label: 'Kundalini', value: 'kundalini' },
  { label: 'Left Channel', value: 'pingala' },
  { label: 'Right Channel', value: 'ida' },
  { label: 'Center Channel', value: 'sushumna' },
] as const

export type SubtleSystemNodeSlug = (typeof SUBTLE_SYSTEM_NODE_OPTIONS)[number]['value']

export const SubtleSystemNodes: CollectionConfig = {
  slug: 'subtle-system-nodes',
  labels: {
    singular: 'Subtle System Node',
    plural: 'Subtle System Nodes',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'slug',
    defaultColumns: ['slug', 'page', 'lectures', 'frames'],
    pagination: {
      defaultLimit: 25,
    },
  },
  fields: [
    {
      name: 'slug',
      type: 'select',
      required: true,
      unique: true,
      index: true,
      options: SUBTLE_SYSTEM_NODE_OPTIONS as unknown as { label: string; value: string }[],
      admin: {
        description: 'Identifier for this chakra or nadi. Closed enum of 12 values.',
      },
    },
    {
      name: 'page',
      type: 'relationship',
      relationTo: 'pages',
      required: true,
      hasMany: false,
      admin: {
        description: 'Page describing this node. Used by app/web clients to render details.',
      },
    },
    {
      name: 'lectures',
      type: 'join',
      collection: 'lectures',
      on: 'subtleSystemNodes',
      defaultLimit: 100,
      admin: {
        components: {
          Cell: {
            path: '@/components/admin/RelationshipCountCell',
            serverProps: { disableLink: true },
          },
        },
      },
    },
    {
      name: 'frames',
      type: 'join',
      collection: 'frames',
      on: 'subtleSystemNode',
      defaultLimit: 100,
      admin: {
        components: {
          Cell: {
            path: '@/components/admin/RelationshipCountCell',
            serverProps: { disableLink: true },
          },
        },
      },
    },
  ],
}
