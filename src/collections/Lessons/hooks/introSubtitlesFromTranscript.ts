import type { FieldHook } from 'payload'

import { extractID } from 'payload/shared'

import { readFileSubtitles } from '@/lib/transcripts/read'

/**
 * afterRead for the virtual `introSubtitles`: the intro file's `subtitles`, in
 * the cue shape the column used to store.
 *
 * shortcut: kept only so app releases reading `introSubtitles` keep their
 * subtitles; delete it once every supported release reads
 * `introAudio.subtitles` instead (#1133).
 *
 * A field hook sees a bare id at any depth (`src/collections/AGENTS.md`). Under
 * `locale=all` the value is a `{ [locale]: id }` map with no one language to
 * answer for, so it answers nothing.
 */
export const introSubtitlesFromTranscript: FieldHook = async ({ siblingData, req }) => {
  const audio: unknown = siblingData?.introAudio
  if (audio === null || audio === undefined) return null
  if (typeof audio === 'object' && !('id' in audio)) return null
  const fileId = Number(extractID(audio as number | { id: number }))
  if (!Number.isInteger(fileId) || fileId <= 0) return null

  return readFileSubtitles(req, fileId)
}
