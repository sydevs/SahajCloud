import type { CollectionConfig } from 'payload'

import { hideUntilCreated } from '@/fields/hideUntilCreated'
import { SUBTLE_SYSTEM_NODE_OPTIONS } from '@/lib/subtleSystem'

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
      access: {
        // Vimeo URL is immutable after creation
        update: () => false,
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
        condition: hideUntilCreated,
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
        condition: hideUntilCreated,
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
