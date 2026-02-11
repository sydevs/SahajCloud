import type { Endpoint } from 'payload'

import type { Image, Meditation, MeditationTag } from '@/payload-types'

type TimingValue = NonNullable<Meditation['timings']>[number]
const VALID_TIMINGS: TimingValue[] = ['morning', 'afternoon', 'evening', 'night']

interface MeditationPreview {
  id: number
  title: string | null
  timings: TimingValue[]
  thumbnail: Image | number | null
  durationMinutes: number | null
}

/**
 * GET /api/meditation-tags/by-timing/:timing
 *
 * Returns MeditationTags that have published meditations for the specified
 * timing and locale. Each tag includes filtered meditation previews.
 *
 * Path params:
 *   timing - One of: morning, afternoon, evening, night
 *
 * Query params:
 *   locale - Meditation locale filter (default: 'en')
 */
export const meditationTagsByTiming: Endpoint = {
  path: '/by-timing/:timing',
  method: 'get',
  handler: async (req) => {
    const timing = req.routeParams?.timing as string
    const locale = (req.query?.locale as string) || 'en'

    // Validate timing parameter
    if (!timing || !VALID_TIMINGS.includes(timing as TimingValue)) {
      return Response.json(
        { error: `Invalid timing. Must be one of: ${VALID_TIMINGS.join(', ')}` },
        { status: 400 },
      )
    }

    // Find published meditations matching timing criteria
    // Includes meditations with empty timings (universal availability)
    const meditations = await req.payload.find({
      collection: 'meditations',
      where: {
        and: [
          { locale: { equals: locale } },
          { _status: { equals: 'published' } },
          { type: { not_equals: 'lesson' } },
          {
            or: [
              { timings: { contains: timing } },
              { timings: { exists: false } },
            ],
          },
        ],
      },
      depth: 1,
      limit: 500,
      sort: '-createdAt',
    })

    // Group meditations by tag ID
    const tagIds = new Set<number>()
    const meditationsByTag = new Map<number, MeditationPreview[]>()

    for (const meditation of meditations.docs) {
      const tags = meditation.tags as Array<number | MeditationTag> | null
      if (!tags) continue

      const preview: MeditationPreview = {
        id: meditation.id,
        title: meditation.title ?? null,
        timings: (meditation.timings ?? []) as TimingValue[],
        thumbnail: meditation.thumbnail ?? null,
        durationMinutes: meditation.durationMinutes ?? null,
      }

      for (const tag of tags) {
        const tagId = typeof tag === 'number' ? tag : tag.id
        tagIds.add(tagId)

        if (!meditationsByTag.has(tagId)) {
          meditationsByTag.set(tagId, [])
        }
        meditationsByTag.get(tagId)!.push(preview)
      }
    }

    if (tagIds.size === 0) {
      return Response.json({ docs: [], totalDocs: 0 })
    }

    // Fetch the tags (excluding parent categories)
    const tags = await req.payload.find({
      collection: 'meditation-tags',
      where: {
        id: { in: Array.from(tagIds) },
        isParent: { not_equals: true },
      },
      sort: 'order',
      limit: 100,
    })

    // Enrich tags with their filtered meditation previews
    const result = tags.docs.map((tag) => ({
      ...tag,
      meditations: meditationsByTag.get(tag.id) ?? [],
    }))

    return Response.json({
      docs: result,
      totalDocs: result.length,
    })
  },
}
