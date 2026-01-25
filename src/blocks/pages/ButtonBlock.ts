import { Block } from 'payload'

export const ButtonBlock: Block = {
  slug: 'button',
  // Icon: Rounded button shape (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iNiIgd2lkdGg9IjE0IiBoZWlnaHQ9IjgiIHJ4PSIyIi8+PGxpbmUgeDE9IjciIHkxPSIxMCIgeDI9IjEzIiB5Mj0iMTAiLz48L3N2Zz4K',
  admin: {
    group: 'Basic',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'text',
          type: 'text',
          required: true,
        },
        {
          name: 'url',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
}
