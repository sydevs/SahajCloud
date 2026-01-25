import { Block } from 'payload'

export const SubtleSystemBlock: Block = {
  slug: 'subtle-system',
  // Icon: Lotus flower with three petals (20x20, gray filled)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSIjNkI3MjgwIj48cGF0aCBkPSJNMTAgM2MtMSAzLTIgNi0yIDhoNGMwLTItMS01LTItOHoiLz48cGF0aCBkPSJNOCAxMWMtNC0xLTYgMS02IDFzMyAyIDYgMnYtM3oiLz48cGF0aCBkPSJNMTIgMTFjNC0xIDYgMSA2IDFzLTMgMi02IDJ2LTN6Ii8+PHBhdGggZD0iTTkgMTVoMnYzSDl6Ii8+PC9zdmc+Cg==',
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
