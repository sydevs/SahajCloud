import type { GlobalConfig } from 'payload'

export const WeMeditateWebConfig: GlobalConfig = {
  slug: 'wm-web-config',
  admin: {
    group: 'WeMeditate Web',
    livePreview: {
      url: ({ data, locale }) => {
        const baseURL = process.env.WEMEDITATE_WEB_URL
        const homePageId = typeof data.homePage === 'object' ? data.homePage?.id : data.homePage
        return `${baseURL}/${locale.code}/preview?collection=pages&id=${homePageId}&secret=${process.env.SAHAJCLOUD_PREVIEW_SECRET}`
      },
    },
  },
  label: 'Configuration',
  fields: [
    {
      name: 'homePage',
      label: 'Home Page',
      type: 'relationship',
      relationTo: 'pages',
      required: true,
    },
    {
      name: 'featuredPages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      minRows: 2,
      maxRows: 3,
      required: true,
      admin: {
        description: 'Select 2-3 pages to feature in the website header and footer.',
      },
    },
    {
      name: 'classPages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      maxRows: 5,
      admin: {
        description:
          'Select up to 5 pages for seekers to start meditating. The first one will be featured in the header. (eg. Classes Near Me, Online Meditations, Recorded Meditations, WeMeditate App',
      },
    },
    {
      name: 'knowledgePages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      maxRows: 5,
      admin: {
        description:
          'Select up to 5 pages for seeker to learn more about meditation. (eg. Shri Mataji, Kundalini, Subtle System, etc)',
      },
    },
    {
      name: 'infoPages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      maxRows: 5,
      admin: {
        description:
          'Select up to 5 meta pages about the website. eg. Privacy Notice, Contact Form, etc.',
      },
    },
  ],
}
