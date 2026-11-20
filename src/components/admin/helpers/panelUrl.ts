/**
 * What the Live Preview panel is pointing at, shared by the fields that move it.
 *
 * The panel is one per document view, and so is this. It is module state rather
 * than refs because the fields hand over **between** tabs: switching tabs
 * unmounts one instance and mounts the next, and the mounting one reads the URL
 * from the render it was mounted in — still the old tab's composed URL, since
 * the outgoing instance's restore has not re-rendered the provider yet. A
 * per-instance ref therefore captures that as its "default" and restores a view
 * nobody asked for on the way out. Remembering what we last composed, for all of
 * them, is what tells a URL we set apart from one Payload resolved.
 *
 * ⚠ **Everything that moves the panel composes through {@link composePanelUrl},
 * not through `setURL` directly.** `PreviewTarget` repoints per tab and
 * `LivePreviewNotice` repoints when the page never answers; a bare `setURL` from
 * either is read as a freshly resolved default by the other, which then restores
 * an explanation page in place of the site.
 */

import { livePreviewUnavailableUrl, type PanelComposedReason } from '@/lib/livePreview/unavailable'

let lastComposedUrl: null | string = null
let serverResolvedUrl: null | string = null

/**
 * Records the provider's current `url`.
 *
 * Any URL none of these fields composed is the server-resolved default, because
 * the provider overwrites `url` whenever the server resolves a new one
 * (`@payloadcms/ui/dist/providers/LivePreview/index.js:100-104`).
 */
export function trackPanelUrl(url: string): void {
  if (url !== lastComposedUrl) serverResolvedUrl = url
}

/** The default: what the panel shows unless one of these fields moved it. */
export function panelDefaultUrl(): null | string {
  return serverResolvedUrl
}

/**
 * The explanation page, absolute against the admin window.
 *
 * ⚠ `livePreviewUnavailableUrl` is root-relative on purpose, for the panel URL
 * Payload resolves itself. `setURL` takes a URL, so a field moving the panel
 * resolves it — here, once, rather than at each call site, where two fields
 * could resolve the same reason against different origins and stop recognising
 * each other's output.
 */
function panelNoticeUrl(reason: PanelComposedReason): string {
  return new URL(livePreviewUnavailableUrl(reason), window.location.origin).toString()
}

/** Points the panel at a URL of our own, and remembers it as ours. */
export function composePanelUrl(setURL: (url: string) => void, url: string): void {
  lastComposedUrl = url
  setURL(url)
}

/**
 * Points the panel at an explanation, unless it is showing that one already.
 * Answers whether it moved, which is what a caller owing a restore records.
 *
 * ⚠ **The one way a browser puts an explanation in the panel.** The watchdog
 * and a tab's `unavailable` declaration both arrive here, so neither can
 * resolve the page against an origin the other would not recognise, and
 * neither can reach `setURL` without {@link composePanelUrl} recording it.
 */
export function composePanelNotice(
  setURL: (url: string) => void,
  reason: PanelComposedReason,
  currentUrl?: null | string,
): boolean {
  const url = panelNoticeUrl(reason)
  if (url === currentUrl) return false

  composePanelUrl(setURL, url)
  return true
}
