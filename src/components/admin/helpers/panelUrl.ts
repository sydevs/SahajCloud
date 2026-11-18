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
 * ⚠ **Every field that moves the panel composes through {@link composePanelUrl},
 * not through `setURL` directly.** `PreviewTarget` repoints per tab and
 * `MapPreviewField` repoints when the atlas never answers; a bare `setURL` from
 * either is read as a freshly resolved default by the other, which then restores
 * an explanation page in place of the site.
 */

import {
  livePreviewUnavailableUrl,
  type LivePreviewUnavailableReason,
} from '@/lib/livePreview/unavailable'

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
export function panelNoticeUrl(reason: LivePreviewUnavailableReason): string {
  return new URL(livePreviewUnavailableUrl(reason), window.location.origin).toString()
}

/** Points the panel at a URL of our own, and remembers it as ours. */
export function composePanelUrl(setURL: (url: string) => void, url: string): void {
  lastComposedUrl = url
  setURL(url)
}
