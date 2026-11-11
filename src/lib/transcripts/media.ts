/**
 * Which `files` rows carry a transcript, and how the run reaches each kind.
 *
 * Pure and dependency-free, because the admin panel's preview reads it in the
 * browser as well as the collection hook and the job on the server.
 *
 * - `audio`: an MP3, fetched from its R2 address as soon as it is saved.
 * - `video`: a Cloudflare Stream upload, fetched from Stream's MP4 download,
 *   which only exists once Stream has processed the video and its webhook has
 *   enabled downloads — so a video's transcript starts there, not on save.
 */
export type TranscribableMedia = 'audio' | 'video'

export function transcribableMedia(mimeType: unknown): TranscribableMedia | null {
  if (mimeType === 'audio/mpeg') return 'audio'
  if (typeof mimeType === 'string' && mimeType.startsWith('video/')) return 'video'
  return null
}
