import { labelOf, type DocumentReport, type SectionSpec } from '@/lib/status'

import {
  PER_TIMING_FIELDS,
  meditationMatchesLocale,
  type Timing,
  type UserChoiceRow,
  type WeMeditateAppStatusConfig,
} from './shared'

const NON_FEATURED_THRESHOLD = 4

interface Ctx {
  rows: UserChoiceRow[]
  nonFeaturedMoodOrGoal: UserChoiceRow[]
}

function buildPerTimingChecks(choice: UserChoiceRow, locale: string) {
  const timings = Array.isArray(choice.timings) ? (choice.timings as string[]) : []
  return timings
    .filter((t): t is Timing => t in PER_TIMING_FIELDS)
    .map((t) => ({
      key: `meditation-${t}-published`,
      passed: meditationMatchesLocale(choice[PER_TIMING_FIELDS[t]], locale),
    }))
}

function toDocReport(choice: UserChoiceRow, locale: string): DocumentReport {
  return {
    id: choice.id as number | string,
    label: labelOf(choice as { id: number | string; title?: unknown }),
    checks: buildPerTimingChecks(choice, locale),
  }
}

function countForTiming(rows: UserChoiceRow[], timing: Timing, locale: string): number {
  return rows.filter((c) => {
    const timings = Array.isArray(c.timings) ? (c.timings as string[]) : []
    if (!timings.includes(timing)) return false
    return meditationMatchesLocale(c[PER_TIMING_FIELDS[timing]], locale)
  }).length
}

export const userChoicesSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'userChoices',
  label: 'User Choices',
  description:
    'Mood, goal, and duration user choices have their meditation assignments configured for this locale.',
  tutorialLink: null,
  checks: {
    'meditation-morning-published': {
      label: 'Morning meditation published',
      description: 'The user choice has a published morning meditation assigned for this locale.',
    },
    'meditation-afternoon-published': {
      label: 'Afternoon meditation published',
      description: 'The user choice has a published afternoon meditation assigned for this locale.',
    },
    'meditation-evening-published': {
      label: 'Evening meditation published',
      description: 'The user choice has a published evening meditation assigned for this locale.',
    },
    'meditation-night-published': {
      label: 'Night meditation published',
      description: 'The user choice has a published night meditation assigned for this locale.',
    },
  },
  prepare: async ({ payload, locale, req }) => {
    const { docs } = await payload.find({
      collection: 'user-choices',
      locale,
      limit: 0,
      pagination: false,
      depth: 1,
      req,
    })
    const rows = docs as unknown as UserChoiceRow[]
    const nonFeaturedMoodOrGoal = rows.filter(
      (c) => !c.isFeatured && (c.type === 'mood' || c.type === 'goal'),
    )
    return { rows, nonFeaturedMoodOrGoal }
  },
  groups: [
    {
      key: 'featured',
      label: 'Featured user choices',
      description:
        'Every featured user choice has a published meditation assigned for each of its enabled timings.',
      type: 'documents',
      evaluate: async ({ rows }, { locale }) =>
        rows
          .filter((c) => c.isFeatured === true && c.type !== 'duration')
          .map((c) => toDocReport(c, locale)),
    },
    {
      key: 'duration',
      label: 'Duration user choices',
      description:
        'Every duration user choice has a published meditation assigned for each of its enabled timings.',
      type: 'documents',
      evaluate: async ({ rows }, { locale }) =>
        rows.filter((c) => c.type === 'duration').map((c) => toDocReport(c, locale)),
    },
    {
      key: 'non-featured-morning',
      label: 'Non-featured morning meditations',
      description:
        'At least four non-featured mood/goal user choices have a published morning meditation assigned.',
      type: 'aggregate',
      threshold: NON_FEATURED_THRESHOLD,
      evaluate: async ({ nonFeaturedMoodOrGoal }, { locale }) => ({
        actual: countForTiming(nonFeaturedMoodOrGoal, 'morning', locale),
      }),
    },
    {
      key: 'non-featured-afternoon',
      label: 'Non-featured afternoon meditations',
      description:
        'At least four non-featured mood/goal user choices have a published afternoon meditation assigned.',
      type: 'aggregate',
      threshold: NON_FEATURED_THRESHOLD,
      evaluate: async ({ nonFeaturedMoodOrGoal }, { locale }) => ({
        actual: countForTiming(nonFeaturedMoodOrGoal, 'afternoon', locale),
      }),
    },
    {
      key: 'non-featured-evening',
      label: 'Non-featured evening meditations',
      description:
        'At least four non-featured mood/goal user choices have a published evening meditation assigned.',
      type: 'aggregate',
      threshold: NON_FEATURED_THRESHOLD,
      evaluate: async ({ nonFeaturedMoodOrGoal }, { locale }) => ({
        actual: countForTiming(nonFeaturedMoodOrGoal, 'evening', locale),
      }),
    },
    {
      key: 'non-featured-night',
      label: 'Non-featured night meditations',
      description:
        'At least four non-featured mood/goal user choices have a published night meditation assigned.',
      type: 'aggregate',
      threshold: NON_FEATURED_THRESHOLD,
      evaluate: async ({ nonFeaturedMoodOrGoal }, { locale }) => ({
        actual: countForTiming(nonFeaturedMoodOrGoal, 'night', locale),
      }),
    },
  ],
}
