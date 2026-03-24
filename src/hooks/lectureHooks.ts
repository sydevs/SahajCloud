import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import { downloadToBuffer, extractVimeoId, fetchNirmalaVidyaVideo } from '@/lib/nirmalaVidyaApi'

/**
 * beforeChange hook that auto-populates lecture fields from the Nirmala Vidya API.
 *
 * Only runs on 'create' operations. On 'update', the hook is a no-op and all
 * fields are left as-is.
 *
 * On create:
 * 1. Extracts the Vimeo ID from `data.nirmalVidyaVimeoUrl`
 * 2. Fetches video metadata from the Nirmala Vidya API
 * 3. Downloads the thumbnail and creates an Images document
 * 4. Populates `title` (if not already provided by user), `videoUrl`, and `thumbnail`
 *
 * Throws a ValidationError if the URL is invalid or the API call fails,
 * which surfaces as a user-visible error in the admin UI.
 */
export const populateFromNirmalaVidya: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data

  const vimeoUrl = data.nirmalVidyaVimeoUrl as string | undefined
  if (!vimeoUrl) return data

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

  let videoData
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

  // Use user-provided title if available, otherwise use the API value
  if (!data.title) {
    data.title = videoData.title
  }

  data.videoUrl = videoData.hlsUrl
  data.lastRefreshed = new Date().toISOString()

  // Download and upload thumbnail as an Images document
  try {
    const thumbnailBuffer = await downloadToBuffer(
      videoData.thumbnailUrl,
      `lecture-thumbnail-${vimeoId}.jpg`,
    )
    const thumbnailImage = await req.payload.create({
      collection: 'images',
      data: { alt: data.title || videoData.title },
      file: thumbnailBuffer,
      req,
    })
    data.thumbnail = thumbnailImage.id
  } catch (thumbError) {
    req.payload.logger.warn({
      msg: 'Failed to auto-download lecture thumbnail — continuing without thumbnail',
      vimeoId,
      error: thumbError instanceof Error ? thumbError.message : String(thumbError),
    })
    // Thumbnail failure is non-fatal — the lecture is still created
  }

  return data
}
