/**
 * Why a document could not be given a live-preview URL.
 *
 * Each value is explained by `src/app/(frontend)/live-preview-unavailable`.
 * Adding one here without adding it there falls back to a generic message
 * rather than breaking, which is the right way round for a panel.
 */
export type LivePreviewUnavailableReason = 'no-key' | 'no-path' | 'no-region' | 'not-reviewable'

/**
 * The URL to point the Live Preview panel at when there is no page to show.
 *
 * ⚠ **Never return `null` from `admin.livePreview.url` instead of calling
 * this.** A falsy URL makes Payload close the panel *and* persist
 * `editViewType: 'default'` as that editor's preference, so preview is off the
 * next time they open any document of that collection. See the page's own
 * docblock for the full reasoning.
 */
export function livePreviewUnavailableUrl(reason: LivePreviewUnavailableReason): string {
  // ⚠ **Root-relative, not absolute.** Payload's `formatAbsoluteURL` resolves
  // it against the admin window, so it is `'self'` by construction and the CSP
  // `frame-src` admits it everywhere.
  //
  // An absolute URL built from `SAHAJCLOUD_URL` did not survive a Railway PR
  // preview: previews inherit the shared production value, so the iframe
  // pointed cross-origin from a `pr-<n>` host and was refused. That combined
  // badly with the other half — a preview environment has no signing key, so
  // EVERY panel resolves here, and the page that exists to avoid a blank panel
  // would have produced one on every PR.
  return `/live-preview-unavailable?reason=${reason}`
}
