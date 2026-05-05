import type { CollectionConfig } from 'payload'

import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

import { audiencesForUser } from '@/endpoints'
import { scheduleField } from '@/fields'

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
    defaultColumns: ['label', 'type', 'lectures', 'appCards'],
  },
  endpoints: [audiencesForUser],
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'progress',
      options: [
        { label: 'Progress', value: 'progress' },
        { label: 'Time & Location', value: 'context' },
      ],
      admin: {
        description:
          'Does this audience group users based on their progress in the app or based on their context (location & time).',
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
    },
    {
      name: 'label',
      type: 'text',
      required: true,
    },
    // ── Progress Rules (shown only for progress-type audiences) ───────────
    {
      type: 'collapsible',
      label: 'Progress Rules',
      admin: {
        condition: (data) => !data?.type || data.type === 'progress',
        description: 'Any empty rule will be ignored',
      },
      fields: [
        progressRangeField('pathProgress', 'Path Progress'),
        progressRangeField('meditationsPerWeek', 'Meditations Per Week'),
        progressRangeField('totalMeditationsViewed', 'Total Meditations Viewed'),
        progressRangeField('totalLecturesViewed', 'Total Lectures Viewed'),
      ],
    },
    // ── Display Conditions (shown only for condition-type audiences) ──────
    {
      type: 'collapsible',
      label: 'Display Conditions',
      admin: {
        condition: (data) => data?.type === 'context',
        description: 'Any empty rule will be ignored',
      },
      fields: [
        {
          name: 'country',
          type: 'select',
          hasMany: true,
          options: COUNTRY_OPTIONS,
          admin: {
            description: 'Restrict to users in these countries.',
          },
        },
        {
          name: 'eventTime',
          type: 'date',
          admin: {
            date: { pickerAppearance: 'timeOnly' },
            description:
              'This condition is met if the this moment is during daytime hours for the user (between 08:00 and 22:00 local time).',
          },
          timezone: true,
        },
        scheduleField({
          hasEndTime: true,
          required: false,
          admin: {
            description:
              "This condition will be met during the scheduled times. This does not rely on the user's local time",
          },
        }),
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
        description: 'All lectures tagged with this condition audience',
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
