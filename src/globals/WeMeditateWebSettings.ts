import type { GlobalConfig } from 'payload'
import { adminOnlyAccess } from '@/lib/accessControl'

export const WeMeditateWebSettings: GlobalConfig = {
  slug: 'we-meditate-web-settings',
  access: adminOnlyAccess(),
  admin: {
    group: 'Configuration',
  },
  label: 'We Meditate Web Config',
  fields: [
    // Overall Group
    {
      name: 'homePage',
      label: 'Home Page',
      type: 'relationship',
      relationTo: 'pages',
      required: true,
      admin: {
        description: 'Select the page content for the home page',
      },
    },
    {
      name: 'featuredPages',
      label: 'Featured Pages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      minRows: 3,
      maxRows: 7,
      required: true,
      admin: {
        description: 'Select 3-7 pages to feature in the website menu. Drag to reorder.',
      },
    },
    {
      name: 'footerPages',
      label: 'Footer Pages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      minRows: 3,
      maxRows: 5,
      required: true,
      admin: {
        description: 'Select 3-5 pages to display in the website footer',
      },
    },

    // Music Page
    {
      type: 'collapsible',
      label: 'Music Page',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'musicPage',
          label: 'Music Page',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'musicPageTags',
          label: 'Music Page Tags',
          type: 'relationship',
          relationTo: 'music-tags',
          hasMany: true,
          minRows: 3,
          maxRows: 5,
          required: true,
          admin: {
            description: 'Select 3-5 music tags to display on the Music page',
          },
        },
      ],
    },

    // Subtle System Page
    {
      type: 'collapsible',
      label: 'Subtle System Page',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'subtleSystemPage',
          label: 'Subtle System Page',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
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
    },

    // Techniques Page
    {
      type: 'collapsible',
      label: 'Techniques Page',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'techniquesPage',
          label: 'Techniques Page',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'techniquePageTag',
          label: 'Technique Page Tag',
          type: 'relationship',
          relationTo: 'page-tags',
          hasMany: false,
          required: true,
          admin: {
            description: 'Select the page tag that represents all technique pages',
          },
        },
      ],
    },

    // Inspiration Page
    {
      type: 'collapsible',
      label: 'Inspiration Page',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'inspirationPage',
          label: 'Inspiration Page',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'inspirationPageTags',
          label: 'Inspiration Page Tags',
          type: 'relationship',
          relationTo: 'page-tags',
          hasMany: true,
          minRows: 3,
          maxRows: 5,
          required: true,
          admin: {
            description: 'Select 3-5 page tags to display on the Inspiration page',
          },
        },
      ],
    },

    // Classes Page
    {
      type: 'collapsible',
      label: 'Classes Pages',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'classesPage',
          label: 'Classes Page',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
        },
        {
          name: 'liveMeditationsPage',
          label: 'Live Meditations Page',
          type: 'relationship',
          relationTo: 'pages',
          required: true,
          admin: {
            description: 'Select the page for live meditation classes',
          },
        },
      ],
    },
  ],
}
