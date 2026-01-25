import { Block } from 'payload'

export const ImageGalleryBlock: Block = {
  slug: 'image-gallery',
  // Icon: Multiple overlapping image frames (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iNCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjgiIHJ4PSIxIi8+PHJlY3QgeD0iNSIgeT0iNyIgd2lkdGg9IjEwIiBoZWlnaHQ9IjgiIHJ4PSIxIi8+PHJlY3QgeD0iOCIgeT0iMTAiIHdpZHRoPSIxMCIgaGVpZ2h0PSI4IiByeD0iMSIvPjxjaXJjbGUgY3g9IjExIiBjeT0iMTMiIHI9IjEuNSIvPjwvc3ZnPgo=',
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
