import { Block } from 'payload'

export const SubtleSystemBlock: Block = {
  slug: 'subtle-system',
  // Icon: Stylized chakra/spine symbol (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGVsbGlwc2UgY3g9IjEwIiBjeT0iNCIgcng9IjMiIHJ5PSIyIi8+PGxpbmUgeDE9IjEwIiB5MT0iNiIgeDI9IjEwIiB5Mj0iMTgiLz48Y2lyY2xlIGN4PSIxMCIgY3k9IjgiIHI9IjEiLz48Y2lyY2xlIGN4PSIxMCIgY3k9IjExIiByPSIxIi8+PGNpcmNsZSBjeD0iMTAiIGN5PSIxNCIgcj0iMSIvPjxjaXJjbGUgY3g9IjEwIiBjeT0iMTciIHI9IjEiLz48L3N2Zz4K',
  labels: {
    singular: 'Subtle System',
    plural: 'Subtle Systems',
  },
  admin: {
    group: 'Content',
  },
  fields: [
    {
      type: 'collapsible',
      label: 'Channel Pages',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'left',
          label: 'Left Channel',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'right',
          label: 'Right Channel',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'center',
          label: 'Center Channel',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Chakra Pages',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'mooladhara',
          label: 'Mooladhara',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'kundalini',
          label: 'Kundalini',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'swadhistan',
          label: 'Swadhistan',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'nabhi',
          label: 'Nabhi',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'void',
          label: 'Void',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'anahat',
          label: 'Anahat',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'vishuddhi',
          label: 'Vishuddhi',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'agnya',
          label: 'Agnya',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'sahasrara',
          label: 'Sahasrara',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
      ],
    },
  ],
}
