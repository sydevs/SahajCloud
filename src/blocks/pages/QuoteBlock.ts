import { Block } from 'payload'

export const QuoteBlock: Block = {
  slug: 'quote',
  // Icon: Quotation marks (20x20, gray filled)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSIjNkI3MjgwIj48cGF0aCBkPSJNNiA4QzYgNi45IDYuOSA2IDggNkM5LjEgNiAxMCA2LjkgMTAgOEMxMCAxMC4yIDggMTIgNiAxM1YxMS41QzcgMTEgOCAxMCA4IDguNUM3LjQgOC44IDYuNyA5IDYgOVY4WiIvPjxwYXRoIGQ9Ik0xMiA4QzEyIDYuOSAxMi45IDYgMTQgNkMxNS4xIDYgMTYgNi45IDE2IDhDMTYgMTAuMiAxNCAxMiAxMiAxM1YxMS41QzEzIDExIDE0IDEwIDE0IDguNUMxMy40IDguOCAxMi43IDkgMTIgOVY4WiIvPjwvc3ZnPgo=',
  admin: {
    group: 'Basic',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
    },
    {
      name: 'text',
      type: 'textarea',
      required: true,
    },
    {
      name: 'credit',
      type: 'text',
      admin: {
        description: 'This is the author or other source for the quote.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: {
        condition: (_, siblingData) => Boolean(siblingData?.credit),
        description: 'This will appear below the credit.',
      },
    },
  ],
}
