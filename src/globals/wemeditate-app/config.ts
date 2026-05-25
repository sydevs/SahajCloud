import type { GlobalConfig } from 'payload'

const APP_REQUIRED_PAGES = [
  { name: 'shriMatajiPage', description: 'Page about Shri Mataji surfaced from the app.' },
  { name: 'sahajaYogaPage', description: 'Page about Sahaja Yoga surfaced from the app.' },
  { name: 'explorePage', description: 'Explore section page surfaced from the app.' },
  { name: 'subtleSystemPage', description: 'Subtle system page surfaced from the app.' },
]

const VIBE_CHECK_IDENTIFIERS = [
  { label: 'What You Feel - Start', value: 'WHAT-YOU-FEEL-START' },
  { label: 'What You Feel - Left', value: 'WHAT-YOU-FEEL-LEFT' },
  { label: 'What You Feel - Right', value: 'WHAT-YOU-FEEL-RIGHT' },
  { label: 'Intro Interpret', value: 'INTRO-INTERPRET' },
  { label: 'BH Cool', value: 'BH-COOL' },
  { label: 'Something No Cool', value: 'SOMETHING-NO-COOL' },
  { label: 'Something Cool', value: 'SOMETHING-COOL' },
  { label: 'BH Nothing', value: 'BH-NOTHING' },
]

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
          label: 'App Pages',
          fields: APP_REQUIRED_PAGES.map(({ name, description }) => ({
            name,
            type: 'relationship' as const,
            relationTo: 'pages' as const,
            required: true,
            admin: { description },
          })),
        },
        {
          label: 'General',
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
