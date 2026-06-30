import { Block } from 'payload'

export const ImageGalleryBlock: Block = {
  slug: 'image-gallery',
  interfaceName: 'ImageGalleryBlock',
  // Icon: Overlapping frames with filled front (20x20, gray stroked/filled)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iNSIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiByeD0iMSIvPjxyZWN0IHg9IjUiIHk9IjMiIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgcng9IjEiLz48cmVjdCB4PSI4IiB5PSI2IiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHJ4PSIxIiBmaWxsPSIjNkI3MjgwIiBzdHJva2U9IiM2QjcyODAiLz48L3N2Zz4K',
  labels: {
    singular: 'Image Gallery',
    plural: 'Image Galleries',
  },
  admin: {
    group: 'Media',
  },
  fields: [
    {
      name: 'items',
      type: 'upload',
      hasMany: true,
      minRows: 3,
      maxRows: 15,
      relationTo: 'images',
    },
  ],
}
