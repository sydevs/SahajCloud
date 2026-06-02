import { resolveAudienceIds } from '@/lib/audiences/resolve'
import { labelOf, refId, type DocumentReport, type SectionSpec } from '@/lib/status'
import { collectRelationshipIds } from '@/lib/status/helpers'

import { lectureHasSubtitlesForLocale, type WeMeditateAppStatusConfig } from './shared'

const PRIORITY_USERCHOICE_THRESHOLD = 10
const BASELINE_AUDIENCE_THRESHOLD = 20

interface PriorityCandidate {
  id: number | string
  title?: unknown
  priority?: unknown
  userChoices?: unknown
}

interface Ctx {
  priorityCandidateDocs: PriorityCandidate[]
  baselineLectureDocs: Record<string, unknown>[]
  userChoiceCoverage: DocumentReport[]
  subtitleDocs: DocumentReport[]
}

export const lecturesSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'lectures',
  label: 'Lectures',
  description: 'Lecture content has subtitles, coverage, and prioritization for this locale.',
  tutorialLink: 'https://example.com/tutorials/lectures',
  checks: {
    'has-lecture': {
      label: 'Has a lecture',
      description: 'At least one lecture is tagged with this user choice.',
    },
    'subtitles-available': {
      label: 'Subtitles available',
      description:
        'The lecture has subtitles available for this locale (clip-level override or NV metadata).',
    },
    'has-priority': {
      label: 'Prioritized',
      description: 'Lecture has a priority value above zero.',
    },
    'has-userchoice-tag': {
      label: 'User-choice tagged',
      description: 'Lecture is tagged with at least one user-choice.',
    },
    'in-baseline-audience': {
      label: 'In baseline audience',
      description: "Lecture is visible to new users for this locale's baseline country.",
    },
  },
  prepare: async ({ payload, locale, config, req }) => {
    // Fetch priority candidates and resolve baseline audience IDs in parallel.
    const [{ docs: rawPriorityCandidates }, baselineAudienceIds] = await Promise.all([
      payload.find({
        collection: 'lectures',
        where: { or: [{ priority: { greater_than: 0 } }, { userChoices: { exists: true } }] },
        locale,
        depth: 0,
        limit: 0,
        pagination: false,
        req,
      }),
      resolveAudienceIds(
        payload,
        {
          pathProgress: 0,
          meditationsPerWeek: 0,
          totalMeditationsViewed: 0,
          totalLecturesViewed: 0,
          country: config.baselineCountry,
        },
        req,
      ),
    ])
    const priorityCandidateDocs = rawPriorityCandidates as unknown as PriorityCandidate[]

    // Baseline-audience lectures (depth 1 needed for subtitles check).
    let baselineLectureDocs: Record<string, unknown>[] = []
    if (baselineAudienceIds.length > 0) {
      const { docs } = await payload.find({
        collection: 'lectures',
        where: { audiences: { in: baselineAudienceIds } },
        locale,
        depth: 1,
        limit: 0,
        pagination: false,
        req,
      })
      baselineLectureDocs = docs as unknown as Record<string, unknown>[]
    }

    // User-choice coverage and lesson-referenced subtitles.
    const [{ docs: userChoices }, { docs: lecturesWithUserChoices }] = await Promise.all([
      payload.find({
        collection: 'user-choices',
        locale,
        limit: 0,
        pagination: false,
        depth: 0,
        req,
      }),
      payload.find({
        collection: 'lectures',
        where: { userChoices: { exists: true } },
        select: { userChoices: true },
        locale,
        limit: 0,
        pagination: false,
        depth: 0,
        req,
      }),
    ])

    const coveredUserChoiceIds = new Set<number | string>()
    for (const lec of lecturesWithUserChoices) {
      const refs = (lec as { userChoices?: unknown }).userChoices
      if (!Array.isArray(refs)) continue
      for (const r of refs) {
        const id = refId(r)
        if (id !== null) coveredUserChoiceIds.add(id)
      }
    }

    const userChoiceCoverage: DocumentReport[] = userChoices.map((choice) => ({
      id: choice.id,
      label: labelOf(choice as { id: number | string; title?: unknown }),
      checks: [{ key: 'has-lecture', passed: coveredUserChoiceIds.has(choice.id) }],
    }))

    const { docs: lessons } = await payload.find({
      collection: 'lessons',
      locale,
      limit: 0,
      pagination: false,
      depth: 0,
      req,
    })
    const referencedLectureIds = Array.from(
      new Set(lessons.flatMap((l) => collectRelationshipIds(l.article, 'lectures'))),
    )
    let referencedLectures: Record<string, unknown>[] = []
    if (referencedLectureIds.length > 0) {
      const { docs } = await payload.find({
        collection: 'lectures',
        where: { id: { in: referencedLectureIds } },
        locale,
        limit: 0,
        pagination: false,
        depth: 1,
        req,
      })
      referencedLectures = docs as unknown as Record<string, unknown>[]
    }
    const subtitleDocs: DocumentReport[] = referencedLectures.map((lecture) => ({
      id: lecture.id as number,
      label: labelOf(lecture as { id: number | string; title?: unknown }),
      checks: [
        {
          key: 'subtitles-available',
          passed: lectureHasSubtitlesForLocale(lecture, locale),
        },
      ],
    }))

    return { priorityCandidateDocs, baselineLectureDocs, userChoiceCoverage, subtitleDocs }
  },
  groups: [
    {
      key: 'priority-with-userchoice',
      label: 'Prioritized lectures with user-choice tags',
      description:
        'At least ten lectures have a priority above zero and at least one user-choice tag.',
      type: 'aggregate',
      threshold: PRIORITY_USERCHOICE_THRESHOLD,
      rowDisplay: 'summarize-excess',
      evaluate: async ({ priorityCandidateDocs }) => {
        const items = priorityCandidateDocs.map((lec) => ({
          id: lec.id,
          label: labelOf(lec as { id: number | string; title?: unknown }),
          checks: [
            {
              key: 'has-priority',
              passed: typeof lec.priority === 'number' && lec.priority > 0,
            },
            {
              key: 'has-userchoice-tag',
              passed: Array.isArray(lec.userChoices) && (lec.userChoices as unknown[]).length > 0,
            },
          ],
        }))
        return { actual: 0, items }
      },
    },
    {
      key: 'baseline-audience',
      label: 'Baseline-audience lectures',
      description:
        "At least twenty lectures are visible to new users for this locale's baseline country and have subtitles.",
      type: 'aggregate',
      threshold: BASELINE_AUDIENCE_THRESHOLD,
      rowDisplay: 'summarize-excess',
      evaluate: async ({ baselineLectureDocs }, { locale }) => {
        const items = baselineLectureDocs.map((lec) => ({
          id: lec.id as number | string,
          label: labelOf(lec as { id: number | string; title?: unknown }),
          checks: [
            { key: 'in-baseline-audience', passed: true },
            {
              key: 'subtitles-available',
              passed: lectureHasSubtitlesForLocale(lec, locale),
            },
          ],
        }))
        return { actual: 0, items }
      },
    },
    {
      key: 'user-choice-coverage',
      label: 'User-choice lecture coverage',
      description: 'Every user choice has at least one lecture tagged with it.',
      type: 'documents',
      evaluate: async (ctx) => ctx.userChoiceCoverage,
    },
    {
      key: 'lesson-referenced-subtitles',
      label: 'Lesson-referenced lecture subtitles',
      description:
        'Every lecture linked from an in-scope lesson has subtitles available for this locale.',
      type: 'documents',
      evaluate: async (ctx) => ctx.subtitleDocs,
    },
  ],
}
