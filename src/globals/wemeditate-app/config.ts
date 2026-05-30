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

type AppPageField = {
  name: string
  description?: string
  label?: string
}

const APP_PAGE_FIELDS: readonly AppPageField[] = [
  { name: 'classesPage' },
  { name: 'liveMeditationsPage' },
  { name: 'explorePage', description: 'Page for exploring full app content' },
  { name: 'exploreDeeperPage', description: 'Page for going deeper spiritually' },
  { name: 'meditateTogetherPage', description: 'Page promoting collective meditation' },
  { name: 'techniquesPage', description: 'Index page for techniques' },
  { name: 'lecturesPage', description: "Index page for Shri Mataji's talks" },
  { name: 'lessonsPage', label: 'Path Page', description: 'Index page for the path' },
  { name: 'musicPage', description: 'Index page for music' },
  { name: 'shriMatajiPage', description: 'Learn more about Shri Mataji.' },
  { name: 'sahajaYogaPage', description: 'Learn more about Sahaja Yoga.' },
  { name: 'subtleSystemPage', description: 'Learn more about the Subtle System.' },
  { name: 'privacyPage' },
  { name: 'termsPage' },
]

export const APP_REQUIRED_PAGE_FIELDS = APP_PAGE_FIELDS.map((p) => p.name)

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
          fields: APP_PAGE_FIELDS.map((page) => ({
            name: page.name,
            ...(page.label ? { label: page.label } : {}),
            type: 'relationship' as const,
            relationTo: 'pages' as const,
            required: true,
            ...(page.description ? { admin: { description: page.description } } : {}),
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
        {
          label: 'Misc',
          fields: [
            {
              name: 'fallbackLecture',
              type: 'relationship',
              relationTo: 'lectures',
              admin: {
                description: 'Lecture shown when no personalized lecture content is available.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'iosAppUrl',
                  label: 'iOS App Url',
                  type: 'text',
                  admin: {
                    description: 'App Store URL for the iOS app.',
                  },
                },
                {
                  name: 'androidAppUrl',
                  type: 'text',
                  admin: {
                    description: 'Play Store URL for the Android app.',
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
