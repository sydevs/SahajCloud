/**
 * What can be transcribed, and how the run reaches it.
 *
 * Pure and dependency-free, because the admin panel reads it in the browser as
 * well as the hooks and the job on the server.
 */

/** The two kinds of recording a transcript belongs to (`transcripts.source`). */
export type RecordingCollection = 'meditations' | 'files'

/**
 * - `audio`: an R2 object, fetched from its address as soon as it is saved.
 * - `video`: a Cloudflare Stream upload, fetched from Stream's MP4 download,
 *   which only exists once Stream has processed the video and its webhook has
 *   enabled downloads — so a video's transcript starts there, not on save.
 */
export type TranscribableMedia = 'audio' | 'video'

export function transcribableMedia(mimeType: unknown): TranscribableMedia | null {
  if (typeof mimeType !== 'string') return null
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return null
}
