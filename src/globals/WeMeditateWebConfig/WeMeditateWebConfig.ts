import type { GlobalConfig } from 'payload'

import { availableLocalesField } from '@/fields/availableLocalesField'
import { serverEnv } from '@/lib/env'
import { livePreviewUrl } from '@/lib/livePreview/url'

export const WeMeditateWebConfig: GlobalConfig = {
  slug: 'wm-web-config',
  admin: {
    group: 'WeMeditate Web',
    livePreview: {
      // The site root, which is what this global configures. It used to
      // resolve `homePage` and preview that page by id — a data-dependent URL,
      // which #708 established re-resolves on every save and clobbers a
      // repointed panel. The root renders the home page anyway.
      url: ({ locale }) =>
        livePreviewUrl({
          base: serverEnv.WEMEDITATE_WEB_URL,
          // Trailing slash for the same reason as the translations global:
          // a relative target must resolve under the locale, not beside it.
          path: locale.code === 'en' ? '' : `${locale.code}/`,
          role: 'wemeditate-web-client',
          // Without this the consumer falls back to "the route's own primary
          // document", and reads drafts for the home *page* rather than for
          // the config global being edited. `wm-web-config` is a declared
          // scope in WeMeditateWeb's closed set; this is its only emitter.
          params: { scope: 'wm-web-config' },
        }),
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
    availableLocalesField({
      translationsSlug: 'wm-web-translations',
      description:
        'Languages We Meditate is offered in. Drives the site’s language picker and the ' +
        'hreflang links on every page. A language can only be selected once the We Meditate ' +
        'Web translations are published in it — publish that global in the language first. ' +
        'Publishing all locales at once includes empty ones, so publish deliberately.',
    }),
    {
      name: 'audiences',
      type: 'relationship',
      relationTo: 'audiences',
      hasMany: true,
      required: true,
      minRows: 1,
      admin: {
        description:
          'Audience(s) the public We Meditate Web site targets for audience-gated content (e.g. related lectures). ' +
          'The site has no per-user login, so this fixed set is what it passes as the `audiences` param.',
      },
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
      name: 'featuredArticles',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: true,
      minRows: 2,
      required: true,
      admin: {
        description: 'Select 2 or more article pages to feature in the website header dropdown.',
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
