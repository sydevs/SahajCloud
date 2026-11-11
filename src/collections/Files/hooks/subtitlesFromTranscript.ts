import type { FieldHook } from 'payload'

import { transcribableMedia } from '@/lib/transcripts/media'
import { readFileSubtitles } from '@/lib/transcripts/read'

/**
 * afterRead for the virtual `subtitles`: the file's transcript cues (#1016).
 *
 * A virtual field rather than the `transcript` join a meditation carries,
 * because a join resolves only on the document read directly — through a
 * populated upload, which is how the app reaches a Path Step's intro file and
 * panel media, it answers bare ids at any depth. A field hook runs on the
 * populated file as well, so the cues arrive where they are used.
 *
 * No `findMany` guard: a populated upload is itself read by a `find`, so the
 * guard would empty exactly the reads this exists for.
 */
export const subtitlesFromTranscript: FieldHook = async ({ data, req }) => {
  const id = Number(data?.id)
  if (!Number.isInteger(id) || id <= 0 || !transcribableMedia(data?.mimeType)) return null
  return readFileSubtitles(req, id)
}
