import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import { buildLectureMetadata } from '@/lib/nirmalaVidya'
import type { NirmalaVidyaVideoData } from '@/lib/nirmalaVidyaApi'
import { extractVimeoId, fetchNirmalaVidyaVideo } from '@/lib/nirmalaVidyaApi'

/**
 * beforeChange hook — create-only, runs only for `type === 'full'`. Fetches
 * the NV API once and packs the response into a single `metadata` JSON field.
 * The editor-visible `title` is auto-filled for the current request locale if
 * the editor didn't supply one; other locales fall back to it via Payload's
 * locale-fallback mechanism.
 *
 * Also enforces uniqueness of `nirmalVidyaVimeoUrl` across full lectures —
 * clips have their URL nulled by `resolveClipParent` before this hook runs,
 * so they don't collide.
 *
 * No thumbnail auto-upload — the editor `thumbnail` field is an optional
 * override now; the /api/lectures/for-audience endpoint falls back to
 * `metadata.thumbnailUrl`.
 */
export const populateFromNirmalaVidya: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data
  if (data.type !== 'full') return data

  const vimeoUrl = data.nirmalVidyaVimeoUrl as string | undefined
  if (!vimeoUrl) {
    throw new ValidationError({
      errors: [
        {
          message: 'A Vimeo URL is required for full lectures.',
          path: 'nirmalVidyaVimeoUrl',
        },
      ],
    })
  }

  const vimeoId = extractVimeoId(vimeoUrl)
  if (!vimeoId) {
    throw new ValidationError({
      errors: [
        {
          message:
            'Invalid Vimeo URL. Please enter a URL like https://vimeo.com/123456789 or https://player.vimeo.com/video/123456789',
          path: 'nirmalVidyaVimeoUrl',
        },
      ],
    })
  }

  // Reject duplicates — surface the existing record's admin URL so the editor
  // can navigate to it directly.
  const existing = await req.payload.find({
    collection: 'lectures',
    where: {
      and: [{ type: { equals: 'full' } }, { nirmalVidyaVimeoUrl: { equals: vimeoUrl } }],
    },
    limit: 1,
    depth: 0,
    req,
  })
  if (existing.docs.length > 0) {
    throw new ValidationError({
      errors: [
        {
          message: `A lecture with this URL already exists: /admin/collections/lectures/${existing.docs[0].id}`,
          path: 'nirmalVidyaVimeoUrl',
        },
      ],
    })
  }

  let videoData: NirmalaVidyaVideoData
  try {
    videoData = await fetchNirmalaVidyaVideo(vimeoId)
  } catch (error) {
    throw new ValidationError({
      errors: [
        {
          message: `Could not fetch lecture data from Nirmala Vidya: ${error instanceof Error ? error.message : 'Unknown error'}`,
          path: 'nirmalVidyaVimeoUrl',
        },
      ],
    })
  }

  const metadata = buildLectureMetadata(videoData)
  data.metadata = metadata

  // Auto-fill the editor-visible title for the current locale when blank.
  if (!data.title) {
    data.title = metadata.title
  }

  return data
}
