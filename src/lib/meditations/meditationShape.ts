import type { PayloadLogger } from 'payload'

import { resolveThumbnailUrl } from '@/lib/utilities/thumbnailUrl'
import type { Meditation, Narrator } from '@/payload-types'

/**
 * Flat, card-ready shape for a meditation returned from the related-content
 * endpoints (e.g. /api/lectures/:id/related-meditations).
 *
 * `title` is the meditation's *public* virtual title (auto-derived from its
 * dominant subtle-system node) — never the internal `label`. `durationMinutes`
 * and `thumbnailUrl` are always present: {@link shapeMeditation} returns `null`
 * rather than emit a card missing any of these three, so consumers never expose
 * a placeholder or internal name. `narratorName` is best-effort (`null` when the
 * narrator relationship isn't populated).
 */
export type MeditationCardData = {
  id: number
  title: string
  durationMinutes: number
  thumbnailUrl: string
  narratorName: string | null
}

/**
 * Shape a Meditation record into a `MeditationCardData` for the card-facing
 * endpoints. Requires `depth ≥ 1` so `thumbnail` is a populated `Image` (for
 * its CDN `url`) and `narrator` is a populated `Narrator` (for its `name`); the
 * virtual `title` / `durationMinutes` fields must have been read (they are
 * computed by afterRead hooks on a normal `find`/`findByID`).
 *
 * Returns `null` when the public `title`, `durationMinutes`, or a thumbnail URL
 * is missing — the endpoint filters these out so every returned card is
 * complete.
 */
export function shapeMeditation(
  meditation: Meditation,
  logger?: Pick<PayloadLogger, 'warn'>,
): MeditationCardData | null {
  const title = meditation.title
  const durationMinutes = meditation.durationMinutes
  const thumbnailUrl = resolveThumbnailUrl({ override: meditation.thumbnail })

  if (!title || typeof durationMinutes !== 'number' || !thumbnailUrl) {
    logger?.warn({
      msg: 'Meditation missing card fields (title/durationMinutes/thumbnail) — skipping',
      meditationId: meditation.id,
      hasTitle: !!title,
      hasDurationMinutes: typeof durationMinutes === 'number',
      hasThumbnail: !!thumbnailUrl,
    })
    return null
  }

  const narrator = meditation.narrator
  const narratorName = narrator && typeof narrator === 'object' ? (narrator as Narrator).name : null

  return { id: meditation.id, title, durationMinutes, thumbnailUrl, narratorName }
}
