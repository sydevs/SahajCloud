'use client'

import type { UIFieldClientComponent } from 'payload'

import { useLivePreviewContext } from '@payloadcms/ui'
import { useEffect, useRef } from 'react'

import {
  composePanelUrl,
  panelDefaultUrl,
  panelNoticeUrl,
  trackPanelUrl,
} from '@/components/admin/helpers/panelUrl'
import type { PreviewTarget as PreviewTargetDeclaration } from '@/fields/previewTargetField'
import { isLivePreviewUnavailableUrl } from '@/lib/livePreview/unavailable'

import { composeTargetUrl } from './composeTargetUrl'

/**
 * Points the Live Preview panel at the view its tab describes, and puts it
 * back when the tab closes. Renders nothing.
 *
 * Wired in by `previewTargetField`, which explains why a mounted field is the
 * signal. Three things about Payload's provider shape this:
 *
 * - **`setURL` closes the panel on a falsy URL** and no-ops on an identical one
 *   (`@payloadcms/ui/dist/providers/LivePreview/index.js:84-96`), so a restore
 *   never passes an empty string.
 * - **The provider overwrites `url` whenever the server-resolved URL changes**
 *   (`:100-104`). Any URL no field of ours composed is therefore the current
 *   default — `helpers/panelUrl` holds that answer for every field that moves
 *   the panel, and is where a restore reads it back.
 * - **A data-dependent `livePreview.url` re-resolves mid-edit** and would
 *   clobber the repoint on every save. A targeted global's URL reads `locale`
 *   and never `data` for that reason. ⚠ `clients` cannot avoid it — the preview
 *   opens the service's own region — so the effect below re-applies whenever
 *   the resolved URL changes under it, which is what keeps a save on another
 *   tab from putting the real atlas back in a panel that should be explaining
 *   itself.
 *
 * ⚠ **`unavailable` is the one target that changes the origin**, and
 * `composeTargetUrl` is not asked about it. The declaration is a reason code
 * rather than a URL, so it carries no origin and no credential, and it lands on
 * the admin's own origin. See `previewTargetField`.
 */
export const PreviewTarget: UIFieldClientComponent = ({ field }) => {
  const target = (field?.admin?.custom as { previewTarget?: PreviewTargetDeclaration } | undefined)
    ?.previewTarget

  const { isLivePreviewEnabled, setIsLivePreviewing, setURL, url } = useLivePreviewContext()

  /**
   * `setURL` is rebuilt on every `url` change, and the unmount cleanup below
   * runs once. Holding the latest one in a ref keeps that cleanup from
   * comparing the restore against a stale `url` — which is exactly the
   * comparison that would drop it.
   */
  const setUrlRef = useRef(setURL)
  useEffect(() => {
    setUrlRef.current = setURL
  })

  /** Whether this instance moved the panel, and so owes it a restore. */
  const repointed = useRef(false)

  useEffect(() => {
    if (!isLivePreviewEnabled || !target?.autoOpen) return
    setIsLivePreviewing(true)
  }, [isLivePreviewEnabled, setIsLivePreviewing, target?.autoOpen])

  useEffect(() => {
    if (!isLivePreviewEnabled || !target?.autoClose) return
    setIsLivePreviewing(false)
  }, [isLivePreviewEnabled, setIsLivePreviewing, target?.autoClose])

  useEffect(() => {
    // An empty `url` is the provider before it has resolved one. Composing
    // against the last document's default instead is how the panel would end
    // up on another global's origin.
    if (!isLivePreviewEnabled || !target || !url) return

    trackPanelUrl(url)
    const resolved = panelDefaultUrl()
    // The document's own refusal outranks a tab's: a service with no atlas is
    // told that on every tab, not that its preview belongs to a tab it lacks.
    if (!resolved || isLivePreviewUnavailableUrl(resolved)) return

    const composed = target.unavailable
      ? panelNoticeUrl(target.unavailable)
      : composeTargetUrl(resolved, target)
    if (!composed || composed === url) return

    repointed.current = true
    composePanelUrl(setURL, composed)
  }, [isLivePreviewEnabled, setURL, target, url])

  useEffect(
    () => () => {
      // Only what this instance moved, and never a falsy URL — `setURL` reads
      // that as "close the panel".
      const resolved = panelDefaultUrl()
      if (repointed.current && resolved) setUrlRef.current(resolved)
    },
    [],
  )

  return null
}

export default PreviewTarget
