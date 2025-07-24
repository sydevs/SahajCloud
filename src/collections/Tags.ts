import type { CollectionConfig } from 'payload'
import { applyClientAccessControl, addAPIUsageTracking } from '../lib/clientAccessControl'

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    group: 'Utility',
    useAsTitle: 'title',
  },
  access: applyClientAccessControl(),
  hooks: addAPIUsageTracking(),
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'meditations',
      type: 'join',
      collection: 'meditations',
      on: 'tags',
    },
    {
      name: 'music',
      type: 'join',
      collection: 'music',
      on: 'tags',
    },
    {
      name: 'media',
      type: 'join',
      collection: 'media',
      on: 'tags',
    },
    {
      name: 'frames',
      type: 'join',
      collection: 'frames',
      on: 'tags',
    },
  ],
}