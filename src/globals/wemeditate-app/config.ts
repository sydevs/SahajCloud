import type { GlobalConfig } from 'payload'

export const VIBE_CHECK_IDENTIFIERS = [
  { label: 'What You Feel - Start', value: 'WHAT-YOU-FEEL-START' },
  { label: 'What You Feel - Left', value: 'WHAT-YOU-FEEL-LEFT' },
  { label: 'What You Feel - Right', value: 'WHAT-YOU-FEEL-RIGHT' },
  { label: 'Intro Interpret', value: 'INTRO-INTERPRET' },
  { label: 'BH Cool', value: 'BH-COOL' },
  { label: 'Something No Cool', value: 'SOMETHING-NO-COOL' },
  { label: 'Something Cool', value: 'SOMETHING-COOL' },
  { label: 'BH Nothing', value: 'BH-NOTHING' },
]

const APP_REQUIRED_PAGES = [
  { name: 'classesPage', description: 'Page describing live online classes for the app.' },
  {
    name: 'liveMeditationsPage',
    description: 'Page describing the live meditations feature for the app.',
  },
  { name: 'techniquesPage', description: 'Page describing meditation techniques for the app.' },
  { name: 'lecturesPage', description: 'Page describing the lectures feature for the app.' },
  { name: 'privacyPage', description: 'Privacy policy page surfaced from the app.' },
  { name: 'termsPage', description: 'Terms of service page surfaced from the app.' },
] as const

export const APP_REQUIRED_PAGE_FIELDS = APP_REQUIRED_PAGES.map((p) => p.name)

export const WeMeditateAppConfig: GlobalConfig = {
  slug: 'wm-app-config',
  admin: {
    group: 'WeMeditate App',
  },
  label: 'Configuration',
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Pages',
          description:
            'App-required pages. The same page is used for every locale; the localized content on each page is sourced at read time.',
          fields: APP_REQUIRED_PAGES.map((page) => ({
            name: page.name,
            type: 'relationship' as const,
            relationTo: 'pages' as const,
            admin: { description: page.description },
          })),
        },
        {
          label: 'First Meditation',
          fields: [
            {
              name: 'selfRealizationMeditation',
              type: 'relationship',
              relationTo: 'meditations',
              localized: true,
              admin: {
                description: 'Self-realization meditation for new users.',
              },
            },
            {
              name: 'postRealizationLecture',
              type: 'relationship',
              relationTo: 'lectures',
              localized: true,
              admin: {
                description: 'Lecture shown after the first meditation.',
              },
            },
            {
              name: 'vibeCheckTracks',
              type: 'array',
              localized: true,
              admin: {
                isSortable: true,
                description:
                  'Audio prompts and subtitles for the vibe check step of the first meditation.',
              },
              fields: [
                {
                  name: 'identifier',
                  type: 'select',
                  required: true,
                  options: VIBE_CHECK_IDENTIFIERS,
                  admin: {
                    description: 'Predefined code identifying this track in the app.',
                  },
                },
                {
                  name: 'audio',
                  type: 'upload',
                  relationTo: 'files',
                  required: true,
                  admin: {
                    description: 'MP3 audio file for this vibe check prompt.',
                  },
                },
                {
                  name: 'subtitles',
                  type: 'upload',
                  relationTo: 'files',
                  required: true,
                  admin: {
                    description: 'WebVTT (.vtt) subtitle file for this audio.',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
