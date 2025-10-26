import { Block } from 'payload'

export const GalleryBlock: Block = {
  slug: 'gallery',
  labels: {
    singular: 'Image Gallery',
    plural: 'Image Galleries',
  },
  fields: [
    {
      name: 'items',
      type: 'upload',
      hasMany: true,
      minRows: 3,
      maxRows: 15,
      relationTo: 'media',
    },
  ],
}
