import type { GlobalConfig } from 'payload'

import { serverEnv } from '@/lib/env'

export const WeMeditateWebConfig: GlobalConfig = {
  slug: 'wm-web-config',
  admin: {
    group: 'System',
    livePreview: {
      url: ({ data, locale }) => {
        const baseURL = serverEnv.WEMEDITATE_WEB_URL
        const homePageId = typeof data.homePage === 'object' ? data.homePage?.id : data.homePage
        return `${baseURL}/${locale.code}/preview?collection=pages&id=${homePageId}`
      },
    },
  },
  label: 'WeMeditate Web',
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
          'Select up to 5 pages for seekers to start meditating. The first one will be featured in the header.',
      },
    },
    {
      name: 'knowledgePages',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      maxRows: 5,
      admin: {
        description: 'Select up to 5 pages for seeker to learn more.',
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
          'Select up to 3 meta pages about the website. eg. Privacy Notice, Contact Form, etc.',
      },
    },
  ],
}
