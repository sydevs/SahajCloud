import type { CollectionConfig } from 'payload'

import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

import { audiencesForUser } from '@/endpoints'

countries.registerLocale(enLocale)

const COUNTRY_OPTIONS = Object.entries(countries.getNames('en'))
  .map(([value, label]) => ({ label: label as string, value }))
  .sort((a, b) => a.label.localeCompare(b.label))

function progressRangeField(name: string, label: string) {
  return {
    name,
    type: 'group' as const,
    label,
    fields: [
      {
        type: 'row' as const,
        fields: [
          {
            name: 'min',
            type: 'number' as const,
            label: 'Min',
            admin: { width: '300px', description: 'Minimum (inclusive). Empty = no lower bound.' },
          },
          {
            name: 'max',
            type: 'number' as const,
            label: 'Max',
            admin: { width: '300px', description: 'Maximum (inclusive). Empty = no upper bound.' },
            validate: (
              value: number | null | undefined,
              { siblingData }: { siblingData: Record<string, unknown> },
            ) => {
              if (
                value !== null &&
                value !== undefined &&
                siblingData?.min !== null &&
                siblingData?.min !== undefined
              ) {
                if (value <= (siblingData.min as number)) return 'Max must be greater than min'
              }
              return true
            },
          },
        ],
      },
    ],
  }
}

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
        description: 'Any empty rule will be ignored. All rules must pass for the audience to match.',
      },
      fields: [
        progressRangeField('pathProgress', 'Path Progress'),
        progressRangeField('meditationsPerWeek', 'Meditations Per Week'),
        progressRangeField('totalMeditationsViewed', 'Total Meditations Viewed'),
        progressRangeField('totalLecturesViewed', 'Total Lectures Viewed'),
        {
          name: 'country',
          type: 'select',
          hasMany: true,
          options: COUNTRY_OPTIONS,
          admin: {
            description: 'Country gate: restrict to users in these countries. Leave empty to match all countries.',
          },
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
