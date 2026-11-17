/**
 * Cloudflare Stream clips every environment's fixture shares, by UID.
 *
 * Uploaded once, on 2026-11-16, under a `fixture-` `meta.name` (each is
 * `tests/files/video-30s.mp4`) and with no `meta.env` tag:
 * `scripts/cleanup-preview-assets.ts` reaps only tagged clips, and a preview's
 * delete guard refuses an untagged one, so no preview can remove them. A row
 * naming one is written with `direct`, since uploading through the app would
 * send a new clip to Stream from every preview. `videos.filename` is unique,
 * so each video row has a clip of its own.
 */
export const STREAM_CLIP = {
  landscape: '8047e58c77e821bb4d94d2fd41a4b5d3',
  portrait: '3473433760c49adb2262d7dd47a5e1c9',
  landscape2: 'f42f17e04811edc5d75309c6e3656fd4',
  portrait2: '0f5e35341caf2fcf86a53d1607204209',
} as const
