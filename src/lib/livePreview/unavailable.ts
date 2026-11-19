/**
 * Why a live-preview panel has no page to show.
 *
 * Each value is explained by `src/app/(frontend)/live-preview-unavailable`.
 * Adding one here without adding it there falls back to a generic message
 * rather than breaking, which is the right way round for a panel.
 *
 * Three things point a panel at that page, and the two halves below are which
 * one did it: the server resolves a {@link ServerResolvedReason} into
 * `admin.livePreview.url`, while a `previewTargetField` declaration and the
 * `LivePreviewNotice` watchdog compose a {@link PanelComposedReason} in the
 * browser.
 *
 * ⚠ **The halves must stay disjoint**, which is what the split states and
 * `live-preview-unavailable.spec.ts` pins. `helpers/panelUrl` tells a URL a
 * component composed from one the server resolved by comparing the URL text
 * alone, so a reason emitted from both sides makes the two byte-identical: the
 * server's explanation is then taken for ours, the recorded default stays the
 * *previous* document's, and a tab's repoint composes against that document's
 * origin.
 */

/** Resolved on the server, where `livePreviewUrl` has no page to point at. */
export type ServerResolvedReason =
  'no-atlas-role' | 'no-classes' | 'no-key' | 'no-path' | 'no-region' | 'not-reviewable'

/** Composed in the browser, by a tab's declaration or by the watchdog. */
export type PanelComposedReason = 'atlas-tab-only' | 'preview-unreachable'

export type LivePreviewUnavailableReason = PanelComposedReason | ServerResolvedReason

const UNAVAILABLE_PATH = '/live-preview-unavailable'

/** Whether a resolved panel URL is already an explanation, absolute or not. */
export function isLivePreviewUnavailableUrl(url: string): boolean {
  return URL.parse(url, 'http://relative.invalid')?.pathname === UNAVAILABLE_PATH
}

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
  return `${UNAVAILABLE_PATH}?reason=${reason}`
}
