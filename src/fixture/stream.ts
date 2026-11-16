/**
 * Cloudflare Stream clips every environment's fixture shares, by UID.
 *
 * Uploaded once, by hand, under a `fixture-` name and with no `meta.env` tag:
 * `scripts/cleanup-preview-assets.ts` reaps only tagged clips, and a preview's
 * delete guard refuses an untagged one, so no preview can remove them. A row
 * naming one is written with `direct`, since uploading through the app would
 * send a new clip to Stream from every preview. `videos.filename` is unique,
 * so each video row has a clip of its own.
 */
export const STREAM_CLIP = {
  landscape: 'fixture-pending-landscape',
  portrait: 'fixture-pending-portrait',
  landscape2: 'fixture-pending-landscape-2',
  portrait2: 'fixture-pending-portrait-2',
} as const
