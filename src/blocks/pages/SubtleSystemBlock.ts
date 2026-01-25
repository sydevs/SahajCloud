import { Block } from 'payload'

export const SubtleSystemBlock: Block = {
  slug: 'subtle-system',
  labels: {
    singular: 'Subtle System',
    plural: 'Subtle Systems',
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
