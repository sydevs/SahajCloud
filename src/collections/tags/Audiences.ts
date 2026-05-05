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
            admin: { width: '50%', description: 'Minimum (inclusive). Empty = no lower bound.' },
          },
          {
            name: 'max',
            type: 'number' as const,
            label: 'Max',
            admin: { width: '50%', description: 'Maximum (inclusive). Empty = no upper bound.' },
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
        { label: 'Condition', value: 'condition' },
      ],
      admin: {
        description:
          'Progress audiences gate based on user progress data. Condition audiences gate based on country, time of day, or schedule.',
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
        description:
          'Set at least one rule. Leave a field empty to match any value for that dimension.',
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
        condition: (data) => data?.type === 'condition',
        description:
          'Leave a condition empty to skip that check. All non-empty conditions must be satisfied.',
      },
      fields: [
        {
          name: 'country',
          type: 'select',
          hasMany: true,
          options: COUNTRY_OPTIONS,
          admin: {
            description: 'Restrict to users in these countries. Empty = no country filter.',
          },
        },
        {
          name: 'eventTime',
          type: 'date',
          admin: {
            date: { pickerAppearance: 'timeOnly' },
            description:
              "Time-of-day gate: passes if this moment, expressed in the user's timezone, falls between 08:00 and 22:00. Empty = no time gate.",
          },
          timezone: true,
        },
        scheduleField({
          hasEndTime: true,
          required: false,
          admin: {
            description:
              'Schedule gate: passes only when a recurring or one-off occurrence is currently active. Empty = no schedule filter.',
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
        description:
          'Only populated for progress-type audiences (lectures use audience targeting, not condition gating).',
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
        description: 'Populated for progress-type audiences (referenced via audiences field).',
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
        description:
          'Populated for condition-type audiences (referenced via conditions field on app cards).',
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
