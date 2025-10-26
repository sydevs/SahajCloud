import { Block } from 'payload'

export const CatalogBlock: Block = {
  slug: 'catalog',
  labels: {
    singular: 'Catalog',
    plural: 'Catalogs',
  },
  fields: [
    {
      name: 'items',
      type: 'relationship',
      hasMany: true,
      minRows: 3,
      maxRows: 6,
      relationTo: ['meditations', 'pages'],
    },
  ],
}
