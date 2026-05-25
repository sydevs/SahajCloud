import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const WeMeditateAppTranslations: GlobalConfig = {
  slug: 'wm-app-translations',
  admin: {
    group: 'WeMeditate App',
  },
  versions: {
    max: 3,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?.markReviewed === true) {
          data.lastReviewedAt = new Date().toISOString()
          data.markReviewed = false
        }
        return data
      },
    ],
  },
  label: 'Translations',
  fields: [
    {
      type: 'tabs',
      tabs: [
        ...buildTranslationTabs(translationsSchema as TranslationsSchema, 'wm-app-translations'),
        {
          label: 'Review',
          description:
            'Manual review tracking for translations. Save with "Mark reviewed" checked to record the current time for this locale.',
          fields: [
            {
              name: 'markReviewed',
              type: 'checkbox',
              localized: true,
              virtual: true,
              admin: {
                description:
                  'Save the global with this checked to record that you reviewed this locale’s translations now. The checkbox always reads as off.',
              },
              hooks: {
                afterRead: [() => false],
              },
            },
            {
              name: 'lastReviewedAt',
              type: 'date',
              localized: true,
              admin: {
                readOnly: true,
                description:
                  'Last time an admin manually marked translations reviewed for this locale.',
              },
            },
          ],
        },
      ],
    },
  ],
}
