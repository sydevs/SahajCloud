import { labelOf, type DocumentReport, type SectionSpec } from '@/lib/status'

import {
  PER_TIMING_FIELDS,
  isolatedReq,
  meditationMatchesLocale,
  readFallbackLabels,
  type Timing,
  type UserChoiceRow,
  type WeMeditateAppStatusConfig,
} from './shared'

const NON_FEATURED_THRESHOLD = 4

type Labels = Map<number | string, string>

interface Ctx {
  rows: UserChoiceRow[]
  nonFeaturedMoodOrGoal: UserChoiceRow[]
  labels: Labels
}

function rowLabel(choice: UserChoiceRow, labels: Labels): string {
  return (
    labels.get(choice.id as number | string) ??
    labelOf(choice as { id: number | string; title?: unknown })
  )
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

function toDocReport(choice: UserChoiceRow, locale: string, labels: Labels): DocumentReport {
  return {
    id: choice.id as number | string,
    label: rowLabel(choice, labels),
    checks: buildPerTimingChecks(choice, locale),
  }
}

function itemsForTiming(
  rows: UserChoiceRow[],
  timing: Timing,
  locale: string,
  labels: Labels,
): Array<{ id: string | number; label: string; checks: Array<{ key: string; passed: boolean }> }> {
  const checkKey = `meditation-${timing}-published` as const
  return rows
    .filter((c) => (Array.isArray(c.timings) ? (c.timings as string[]) : []).includes(timing))
    .map((c) => ({
      id: c.id as number | string,
      label: rowLabel(c, labels),
      checks: [
        { key: checkKey, passed: meditationMatchesLocale(c[PER_TIMING_FIELDS[timing]], locale) },
      ],
    }))
}

export const userChoicesSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'userChoices',
  label: 'User Choices',
  description:
    'Mood, goal, and duration user choices have their meditation assignments configured for this locale.',
  tutorialLink: 'https://example.com/tutorials/user-choices',
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
      // The four per-timing meditations are localized, so the fallback would
      // report a choice as configured off English assignments.
      fallbackLocale: false,
      limit: 0,
      pagination: false,
      depth: 1,
      req: isolatedReq(req),
    })
    const rows = docs as unknown as UserChoiceRow[]
    const nonFeaturedMoodOrGoal = rows.filter(
      (c) => !c.isFeatured && (c.type === 'mood' || c.type === 'goal'),
    )
    const labels = await readFallbackLabels(
      payload,
      'user-choices',
      rows.map((c) => c.id as number | string),
      locale,
      req,
    )
    return { rows, nonFeaturedMoodOrGoal, labels }
  },
  groups: [
    {
      key: 'featured',
      label: 'Featured user choices',
      description:
        'Every featured user choice has a published meditation assigned for each of its enabled timings.',
      type: 'documents',
      evaluate: async ({ rows, labels }, { locale }) =>
        rows
          .filter((c) => c.isFeatured === true && c.type !== 'duration')
          .map((c) => toDocReport(c, locale, labels)),
    },
    {
      key: 'duration',
      label: 'Duration user choices',
      description:
        'Every duration user choice has a published meditation assigned for each of its enabled timings.',
      type: 'documents',
      evaluate: async ({ rows, labels }, { locale }) =>
        rows.filter((c) => c.type === 'duration').map((c) => toDocReport(c, locale, labels)),
    },
    {
      key: 'non-featured-morning',
      label: 'Non-featured morning meditations',
      description:
        'At least four non-featured mood/goal user choices have a published morning meditation assigned.',
      type: 'aggregate',
      threshold: NON_FEATURED_THRESHOLD,
      rowDisplay: 'summarize-excess',
      evaluate: async ({ nonFeaturedMoodOrGoal, labels }, { locale }) => ({
        items: itemsForTiming(nonFeaturedMoodOrGoal, 'morning', locale, labels),
      }),
    },
    {
      key: 'non-featured-afternoon',
      label: 'Non-featured afternoon meditations',
      description:
        'At least four non-featured mood/goal user choices have a published afternoon meditation assigned.',
      type: 'aggregate',
      threshold: NON_FEATURED_THRESHOLD,
      rowDisplay: 'summarize-excess',
      evaluate: async ({ nonFeaturedMoodOrGoal, labels }, { locale }) => ({
        items: itemsForTiming(nonFeaturedMoodOrGoal, 'afternoon', locale, labels),
      }),
    },
    {
      key: 'non-featured-evening',
      label: 'Non-featured evening meditations',
      description:
        'At least four non-featured mood/goal user choices have a published evening meditation assigned.',
      type: 'aggregate',
      threshold: NON_FEATURED_THRESHOLD,
      rowDisplay: 'summarize-excess',
      evaluate: async ({ nonFeaturedMoodOrGoal, labels }, { locale }) => ({
        items: itemsForTiming(nonFeaturedMoodOrGoal, 'evening', locale, labels),
      }),
    },
    {
      key: 'non-featured-night',
      label: 'Non-featured night meditations',
      description:
        'At least four non-featured mood/goal user choices have a published night meditation assigned.',
      type: 'aggregate',
      threshold: NON_FEATURED_THRESHOLD,
      rowDisplay: 'summarize-excess',
      evaluate: async ({ nonFeaturedMoodOrGoal, labels }, { locale }) => ({
        items: itemsForTiming(nonFeaturedMoodOrGoal, 'night', locale, labels),
      }),
    },
  ],
}
