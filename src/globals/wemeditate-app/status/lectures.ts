import { countLecturesForAudiences, resolveAudienceIds } from '@/lib/audiences/resolve'
import { labelOf, refId, type DocumentReport, type SectionSpec } from '@/lib/status'
import { collectRelationshipIds } from '@/lib/status/helpers'

import { lectureHasSubtitlesForLocale, type WeMeditateAppStatusConfig } from './shared'

const PRIORITY_USERCHOICE_THRESHOLD = 10
const BASELINE_AUDIENCE_THRESHOLD = 20

interface Ctx {
  priorityCount: number
  baselineLectureCount: number
  userChoiceCoverage: DocumentReport[]
  subtitleDocs: DocumentReport[]
}

export const lecturesSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'lectures',
  tutorialLink: null,
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
  },
  prepare: async ({ payload, locale, config, req }) => {
    // Priority/user-choice aggregate.
    const priorityCountResult = await payload.count({
      collection: 'lectures',
      where: {
        and: [{ priority: { greater_than: 0 } }, { userChoices: { exists: true } }],
      },
      locale,
      req,
    })

    // Baseline-audience aggregate.
    const baselineAudienceIds = await resolveAudienceIds(
      payload,
      {
        pathProgress: 0,
        meditationsPerWeek: 0,
        totalMeditationsViewed: 0,
        totalLecturesViewed: 0,
        country: config.baselineCountry,
      },
      req,
    )
    const baselineLectureCount = await countLecturesForAudiences(payload, {
      audiences: baselineAudienceIds,
      locale,
      req,
    })

    // User-choice coverage — one bulk fetch.
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

    // Lesson-referenced subtitles — walk every lesson's `article`, collect
    // referenced lecture IDs, then one fetch by id list at depth 1.
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

    return {
      priorityCount: priorityCountResult.totalDocs,
      baselineLectureCount,
      userChoiceCoverage,
      subtitleDocs,
    }
  },
  groups: [
    {
      key: 'priority-with-userchoice',
      label: 'Prioritized lectures with user-choice tags',
      description:
        'At least ten lectures have a priority above zero and at least one user-choice tag.',
      type: 'aggregate',
      threshold: PRIORITY_USERCHOICE_THRESHOLD,
      evaluate: async (ctx) => ctx.priorityCount,
    },
    {
      key: 'baseline-audience',
      label: 'Baseline-audience lectures',
      description:
        "At least twenty lectures are visible to the most-restrictive new-user audience for this locale's baseline country.",
      type: 'aggregate',
      threshold: BASELINE_AUDIENCE_THRESHOLD,
      evaluate: async (ctx) => ctx.baselineLectureCount,
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
