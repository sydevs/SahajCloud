import type { CollectionConfig } from 'payload'

import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

import { audiencesForUser } from './endpoints/forUser'
import { progressRangeField } from './progressRangeField'

countries.registerLocale(enLocale)

const COUNTRY_OPTIONS = Object.entries(countries.getNames('en'))
  .map(([value, label]) => ({ label: label as string, value }))
  .sort((a, b) => a.label.localeCompare(b.label))

export const Audiences: CollectionConfig = {
  slug: 'audiences',
  labels: {
    singular: 'Audience',
    plural: 'Audiences',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'label',
    defaultColumns: ['label', 'lectures', 'appCards'],
  },
  endpoints: [audiencesForUser],
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
    },
    // ── Rules (progress ranges + optional country gate) ───────────────────
    {
      type: 'collapsible',
      label: 'Rules',
      admin: {
        description:
          'Any empty rule will be ignored. All rules must pass for the audience to match.',
      },
      fields: [
        progressRangeField('pathProgress', 'Path Progress'),
        progressRangeField('meditationsPerWeek', 'Meditations Per Week'),
        progressRangeField('totalMeditationsViewed', 'Total Meditations Viewed'),
        progressRangeField('totalLecturesViewed', 'Total Lectures Viewed'),
        {
          name: 'location',
          type: 'group',
          label: 'Location',
          fields: [
            {
              name: 'countries',
              label: 'Allowed Countries',
              type: 'select',
              hasMany: true,
              options: COUNTRY_OPTIONS,
              admin: {
                description:
                  'Restrict to users in these countries. Leave empty to match all countries.',
              },
            },
          ],
        },
      ],
    },
    // ── Bidirectional joins (unconditional — read-only inverses) ──────────
    {
      name: 'lectures',
      type: 'join',
      collection: 'lectures',
      on: 'audiences',
      defaultLimit: 100,
      admin: {
        description: 'All lectures tagged with this audience',
        components: {
          Cell: {
            path: '@/components/admin/RelationshipCountCell',
            serverProps: { disableLink: true },
          },
        },
      },
    },
    {
      name: 'appCards',
      type: 'join',
      collection: 'app-cards',
      on: 'audiences',
      defaultLimit: 100,
      admin: {
        description: 'All app cards tagged with this audience',
        components: {
          Cell: {
            path: '@/components/admin/RelationshipCountCell',
            serverProps: { disableLink: true },
          },
        },
      },
    },
    {
      name: 'appCardConditions',
      type: 'join',
      collection: 'app-cards',
      on: 'conditions',
      defaultLimit: 100,
      admin: {
        description: 'All app cards that require this audience as a condition',
        components: {
          Cell: {
            path: '@/components/admin/RelationshipCountCell',
            serverProps: { disableLink: true },
          },
        },
      },
    },
  ],
}
