import {
  isUploadAssigned,
  labelOf,
  refId,
  type DocumentReport,
  type GroupSpec,
  type SectionSpec,
} from '@/lib/status'
import { containsRelationship, richTextHasContent } from '@/lib/status/helpers'
import { transcriptSpeaksLocale } from '@/lib/transcripts/language'
import { readFinishedFileTranscripts } from '@/lib/transcripts/read'
import { type Lesson } from '@/payload-types'

import { isolatedReq, readFallbackTitles, type WeMeditateAppStatusConfig } from './shared'

interface Ctx {
  lessons: Lesson[]
  /**
   * Row labels only. `lesson-title-set` answers off the per-locale `title`,
   * so these must stay out of the documents the checks read.
   */
  labels: Map<number | string, unknown>
  /**
   * The intro files whose finished transcript is in the language being read.
   * A step's intro subtitles are its intro file's transcript (#1016), so this
   * is what `intro-subtitles-set` reads — one query for every step, rather
   * than the virtual `introSubtitles` resolving one file per step.
   *
   * ⚠ **A transcript in another language does not count.** The same mismatch
   * `RecordingLanguageWarning` warns the editor about would otherwise read green
   * here, which is the one screen an operator decides a locale from.
   */
  subtitledForLocale: Set<number | string>
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
    description:
      'All lessons in Unit 4 are fully configured for this locale (optional for launch).',
    optional: true,
  },
]

function buildUnitDocs(
  lessons: Lesson[],
  unit: string,
  labels: Ctx['labels'],
  subtitledForLocale: Ctx['subtitledForLocale'],
): DocumentReport[] {
  return lessons
    .filter((l) => l.unit === unit)
    .map((lesson) => ({
      id: lesson.id,
      label: labelOf({ id: lesson.id, title: labels.get(lesson.id) }),
      checks: [
        {
          key: 'lesson-title-set',
          passed: typeof lesson.title === 'string' && lesson.title.trim().length > 0,
        },
        {
          key: 'panels-set',
          passed: Array.isArray(lesson.panels) && lesson.panels.length >= 1,
        },
        { key: 'intro-audio-set', passed: isUploadAssigned(lesson.introAudio) },
        {
          key: 'intro-subtitles-set',
          passed: subtitledForLocale.has(refId(lesson.introAudio) ?? ''),
        },
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

const unitGroupSpecs: GroupSpec<Ctx, WeMeditateAppStatusConfig>[] = UNIT_GROUPS.map((u) => ({
  key: u.key,
  label: u.label,
  description: u.description,
  optional: u.optional,
  type: 'documents',
  evaluate: async ({ lessons, labels, subtitledForLocale }) =>
    buildUnitDocs(lessons, u.unit, labels, subtitledForLocale),
}))

export const lessonsSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'lessons',
  label: 'Path Lessons',
  description:
    'Every lesson in units 1–3 is fully configured for this locale (unit 4 is optional).',
  tutorialLink: null,
  checks: {
    // Not `title-set`: a check key is global across sections, and app-cards
    // owns that one with its own description.
    'lesson-title-set': {
      label: 'Title set',
      description: 'The lesson has a title for this locale.',
    },
    'panels-set': {
      label: 'Panels configured',
      description: 'The lesson has at least one panel.',
    },
    'intro-audio-set': {
      label: 'Intro audio set',
      description: 'The lesson has an intro-audio file assigned for this locale.',
    },
    // Prefixed `intro-`, because a check key is global across sections and
    // `subtitle-set`, `subtitles-set` and `subtitles-available` are all taken.
    'intro-subtitles-set': {
      label: 'Intro subtitles set',
      description:
        'The intro audio for this locale has a finished transcript in this language, which is its subtitles. A recording transcribed in another language does not count — that is the mismatch the editor is warned about. Most locales have no intro audio of their own yet — the recordings were English-only until they became per-language.',
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
    const [{ docs }, labels] = await Promise.all([
      payload.find({
        collection: 'lessons',
        locale,
        // `title`, `panels`, `meditation`, `article` and `introAudio` are all
        // localized (#977, #1016), so the fallback would answer every check
        // but `icon-set` off the English value.
        fallbackLocale: false,
        limit: 0,
        pagination: false,
        depth: 0,
        // The virtual copy of the intro transcript, read once below for every
        // step instead.
        select: { introSubtitles: false },
        req: isolatedReq(req),
      }),
      readFallbackTitles(payload, 'lessons', { locale, req }),
    ])
    const lessons = docs as Lesson[]
    const fileIds = [
      ...new Set(lessons.map((lesson) => refId(lesson.introAudio)).filter((id) => id !== null)),
    ]
    const transcripts = await readFinishedFileTranscripts(payload, fileIds, {
      req: isolatedReq(req),
    })
    const subtitledForLocale = new Set(
      transcripts
        .filter((row) => transcriptSpeaksLocale(row.language, locale))
        .map((row) => row.fileId),
    )
    return { lessons, labels, subtitledForLocale }
  },
  groups: unitGroupSpecs,
}
