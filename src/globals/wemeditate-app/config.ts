import type { GlobalConfig } from 'payload'

const VIBE_CHECK_IDENTIFIERS = [
  { label: 'WHAT-YOU-FEEL-START', value: 'WHAT-YOU-FEEL-START' },
  { label: 'WHAT-YOU-FEEL-LEFT', value: 'WHAT-YOU-FEEL-LEFT' },
  { label: 'WHAT-YOU-FEEL-RIGHT', value: 'WHAT-YOU-FEEL-RIGHT' },
  { label: 'INTRO-INTERPRET', value: 'INTRO-INTERPRET' },
  { label: 'BH-COOL', value: 'BH-COOL' },
  { label: 'SOMETHING-NO-COOL', value: 'SOMETHING-NO-COOL' },
  { label: 'SOMETHING-COOL', value: 'SOMETHING-COOL' },
  { label: 'BH-NOTHING', value: 'BH-NOTHING' },
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
      ],
    },
  ],
}
