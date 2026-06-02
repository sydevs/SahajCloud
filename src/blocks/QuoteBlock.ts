import { Block } from 'payload'

export const QuoteBlock: Block = {
  slug: 'quote',
  labels: {
    singular: 'Quote Box',
    plural: 'Quote Boxes',
  },
  // Icon: Quotation marks in rounded box (20x20, gray stroked/filled)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxwYXRoIGQ9Ik02IDEwQzYgOC41IDYuNSA3LjUgNy41IDcuNUM4LjUgNy41IDkgOC41IDkgMTBDOSAxMS41IDggMTIuNSA2LjUgMTNWMTJDNy41IDExLjUgOCAxMSA4IDEwQzcuNSAxMC4zIDcgMTAuNSA2LjUgMTAuNUM2LjIgMTAuNSA2IDEwLjMgNiAxMFoiIGZpbGw9IiM2QjcyODAiLz48cGF0aCBkPSJNMTEgMTBDMTEgOC41IDExLjUgNy41IDEyLjUgNy41QzEzLjUgNy41IDE0IDguNSAxNCAxMEMxNCAxMS41IDEzIDEyLjUgMTEuNSAxM1YxMkMxMi41IDExLjUgMTMgMTEgMTMgMTBDMTIuNSAxMC4zIDEyIDEwLjUgMTEuNSAxMC41QzExLjIgMTAuNSAxMSAxMC4zIDExIDEwWiIgZmlsbD0iIzZCNzI4MCIvPjwvc3ZnPgo=',
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
