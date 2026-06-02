import {
  isUploadAssigned,
  labelOf,
  refId,
  type DocumentReport,
  type GroupSpec,
  type SectionSpec,
} from '@/lib/status'
import { containsRelationship, richTextHasContent } from '@/lib/status/helpers'
import { type Lesson } from '@/payload-types'

import { type WeMeditateAppStatusConfig } from './shared'

interface Ctx {
  lessons: Lesson[]
}

/**
 * The Lessons collection's `unit` field defines four units today. Each
 * unit becomes its own documents group; the first three are required
 * for launch, the fourth is post-launch (optional). Adding `Unit 5`
 * later is a one-line spec edit (declare a new group below).
 */
const UNIT_GROUPS: ReadonlyArray<{
  key: string
  unit: string
  label: string
  description: string
  optional?: boolean
}> = [
  {
    key: 'unit-1',
    unit: 'Unit 1',
    label: 'Unit 1',
    description: 'All lessons in Unit 1 are fully configured for this locale.',
  },
  {
    key: 'unit-2',
    unit: 'Unit 2',
    label: 'Unit 2',
    description: 'All lessons in Unit 2 are fully configured for this locale.',
  },
  {
    key: 'unit-3',
    unit: 'Unit 3',
    label: 'Unit 3',
    description: 'All lessons in Unit 3 are fully configured for this locale.',
  },
  {
    key: 'unit-4',
    unit: 'Unit 4',
    label: 'Unit 4',
    description: 'All lessons in Unit 4 are fully configured for this locale (optional for launch).',
    optional: true,
  },
]

function buildUnitDocs(lessons: Lesson[], unit: string): DocumentReport[] {
  return lessons
    .filter((l) => l.unit === unit)
    .map((lesson) => ({
      id: lesson.id,
      label: labelOf(lesson as { id: number | string; title?: unknown }),
      checks: [
        {
          key: 'panels-set',
          passed: Array.isArray(lesson.panels) && lesson.panels.length >= 1,
        },
        { key: 'intro-audio-set', passed: isUploadAssigned(lesson.introAudio) },
        { key: 'meditation-set', passed: refId(lesson.meditation) !== null },
        { key: 'article-localized', passed: richTextHasContent(lesson.article) },
        {
          key: 'article-has-lecture-link',
          passed: containsRelationship(lesson.article, 'lectures'),
        },
        { key: 'icon-set', passed: isUploadAssigned(lesson.icon) },
      ],
    }))
}

const unitGroupSpecs: GroupSpec<Ctx, WeMeditateAppStatusConfig>[] = UNIT_GROUPS.map(
  (u) => ({
    key: u.key,
    label: u.label,
    description: u.description,
    optional: u.optional,
    type: 'documents',
    evaluate: async ({ lessons }) => buildUnitDocs(lessons, u.unit),
  }),
)

export const lessonsSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'lessons',
  label: 'Path Lessons',
  description:
    'Every lesson in units 1–3 is fully configured for this locale (unit 4 is optional).',
  tutorialLink: null,
  checks: {
    'panels-set': {
      label: 'Panels configured',
      description: 'The lesson has at least one panel.',
    },
    'intro-audio-set': {
      label: 'Intro audio set',
      description: 'The lesson has an intro-audio file assigned.',
    },
    'meditation-set': {
      label: 'Meditation assigned',
      description: 'The lesson has a meditation assigned for this locale.',
    },
    'article-localized': {
      label: 'Article translated',
      description: 'The lesson article has non-empty content for this locale.',
    },
    'article-has-lecture-link': {
      label: 'Article links to a lecture',
      description: 'The lesson article contains at least one lecture relationship link.',
    },
    'icon-set': {
      label: 'Icon assigned',
      description: 'The lesson has an icon image assigned.',
    },
  },
  prepare: async ({ payload, locale, req }) => {
    const { docs } = await payload.find({
      collection: 'lessons',
      locale,
      limit: 0,
      pagination: false,
      depth: 0,
      req,
    })
    return { lessons: docs as Lesson[] }
  },
  groups: unitGroupSpecs,
}
