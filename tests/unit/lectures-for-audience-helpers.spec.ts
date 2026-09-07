import { describe, expect, it } from 'vitest'

import {
  mergeSubtitles,
  shapeLecture,
  shapeUserChoices,
} from '@/lib/lectures/lectureShape'
import type { Lecture, UserChoice } from '@/payload-types'


/** The `overrides` argument's own type, so locale codes are checked. */
type SubtitleOverrides = NonNullable<Lecture['subtitles']>

/**
 * A populated `userChoices` row, cast from the two fields the feed reads.
 *
 * Fixture assumption: `Lectures.userChoices` is a `hasMany` relationship to
 * `user-choices`, and that collection's `title` is localized — so a populated
 * row is a document carrying a single resolved `title` string, not a map.
 * Verified against `src/collections/Lectures/Lectures.ts` (the `userChoices`
 * field, `hasMany: true`, `relationTo: 'user-choices'`) and
 * `src/collections/UserChoices/UserChoices.ts` (`name: 'title'`,
 * `localized: true`).
 */
const populatedChoice = (id: number, title: string | null): UserChoice =>
  ({ id, title }) as UserChoice

/**
 * The smallest lecture `shapeLecture` will shape rather than drop: a full
 * lecture whose NV `metadata` carries an `hlsUrl`.
 *
 * Fixture assumption: a full lecture owns its own `metadata`, so no parent has
 * to be populated for it to shape, and its `type` is `'full'` — not `'clip'`,
 * the only value `shapeLecture` branches on. Verified against
 * `src/collections/Lectures/Lectures.ts` (the `type` field's options) and
 * `src/lib/lectures/lectureShape.ts` (`metadataSource`).
 */
const playableLecture = (overrides: Partial<Lecture> = {}): Lecture =>
  ({
    id: 1,
    type: 'full',
    title: 'A lecture',
    metadata: { hlsUrl: 'https://example.test/a.m3u8', duration: 600 },
    ...overrides,
  }) as Lecture

describe('mergeSubtitles', () => {
  it('returns the base map unchanged when there are no overrides', () => {
    const base = { en: 'base-en', es: 'base-es' }
    expect(mergeSubtitles(base, undefined)).toEqual(base)
    expect(mergeSubtitles(base, null)).toEqual(base)
    expect(mergeSubtitles(base, [])).toEqual(base)
  })

  it('layers each non-empty override on top of the base map', () => {
    const base = { en: 'base-en', es: 'base-es', de: 'base-de' }
    const overrides: SubtitleOverrides = [
      { locale: 'es', url: 'override-es' },
      { locale: 'fr', url: 'override-fr' },
    ]
    expect(mergeSubtitles(base, overrides)).toEqual({
      en: 'base-en',
      es: 'override-es', // overridden
      de: 'base-de',
      fr: 'override-fr', // added
    })
  })

  it('ignores override rows with empty or missing url', () => {
    const base = { en: 'base-en' }
    const overrides: SubtitleOverrides = [
      { locale: 'en', url: '' },
      { locale: 'es', url: 'override-es' },
    ]
    expect(mergeSubtitles(base, overrides)).toEqual({
      en: 'base-en', // empty url did NOT override
      es: 'override-es',
    })
  })

  it('returns an empty object when neither side has data', () => {
    expect(mergeSubtitles(null, null)).toEqual({})
    expect(mergeSubtitles(undefined, undefined)).toEqual({})
  })

  it('does not mutate the input base map', () => {
    const base = { en: 'base-en' }
    mergeSubtitles(base, [{ locale: 'es', url: 'override-es' }])
    expect(base).toEqual({ en: 'base-en' })
  })
})

describe('shapeUserChoices', () => {
  it('returns an empty array when the relationship is absent', () => {
    expect(shapeUserChoices(null)).toEqual([])
    expect(shapeUserChoices(undefined)).toEqual([])
    expect(shapeUserChoices([])).toEqual([])
  })

  it('maps a populated row to its id and localized title', () => {
    expect(shapeUserChoices([populatedChoice(7, 'Calme intérieur')])).toEqual([
      { id: 7, title: 'Calme intérieur' },
    ])
  })

  it('keeps an unpopulated id, labelling it null rather than dropping it', () => {
    // A depth-0 read returns ids. Dropping them would report the lecture as
    // belonging to no user choice at all, which a consumer cannot tell apart
    // from the truth.
    expect(shapeUserChoices([4, 9])).toEqual([
      { id: 4, title: null },
      { id: 9, title: null },
    ])
  })

  it('preserves the order the lecture stores', () => {
    expect(
      shapeUserChoices([populatedChoice(3, 'Third'), 1, populatedChoice(2, 'Second')]),
    ).toEqual([
      { id: 3, title: 'Third' },
      { id: 1, title: null },
      { id: 2, title: 'Second' },
    ])
  })

  it('normalises a populated row carrying no title to null', () => {
    expect(shapeUserChoices([populatedChoice(5, null)])).toEqual([{ id: 5, title: null }])
  })
})

describe('shapeLecture returns userChoices', () => {
  // These cover the WIRING, not the helper. Unwiring `shapeUserChoices` from
  // `shapeLecture` left every `shapeUserChoices` case above green, because a
  // pure helper's spec cannot see whether its caller calls it.
  it('carries the lecture memberships onto the feed record', () => {
    const shaped = shapeLecture(
      playableLecture({ userChoices: [populatedChoice(11, 'Stress relief')] }),
    )
    expect(shaped?.userChoices).toEqual([{ id: 11, title: 'Stress relief' }])
  })

  it('returns an empty array for a lecture with no user choices', () => {
    expect(shapeLecture(playableLecture())?.userChoices).toEqual([])
  })

  it("uses a clip's own memberships, not its parent lecture's", () => {
    // A clip is assigned to a user choice independently. Inheriting the
    // parent's would report a membership no editor ever set.
    const parent = playableLecture({
      id: 2,
      userChoices: [populatedChoice(99, 'Parent only')],
    })
    const clip = shapeLecture({
      id: 3,
      type: 'clip',
      title: 'A clip',
      metadata: null,
      fullLecture: parent,
      userChoices: [populatedChoice(12, 'Clip only')],
    } as unknown as Lecture)
    expect(clip?.userChoices).toEqual([{ id: 12, title: 'Clip only' }])
  })
})

// The two read bounds — `LECTURE_FEED_SELECT.userChoices` and
// `LECTURE_FEED_POPULATE` — are deliberately NOT asserted here. Restating a
// constant's literal value only fails when someone edits the constant, and the
// fix is then to edit the expectation. Both are covered by their effect
// instead, in `tests/int/lectures-for-audience.int.spec.ts`: the `expectedKeys`
// pin needs the select, and `strips everything but title from a populated user
// choice` needs the populate.
