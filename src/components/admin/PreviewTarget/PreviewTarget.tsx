'use client'

import type { UIFieldClientComponent } from 'payload'

import { useLivePreviewContext } from '@payloadcms/ui'
import { useEffect, useRef } from 'react'

import type { PreviewTarget as PreviewTargetDeclaration } from '@/fields/previewTargetField'

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
 *   (`:100-104`). Any URL this component did not compose is therefore the
 *   current default, and is captured as the value to restore.
 * - **A data-dependent `livePreview.url` re-resolves mid-edit** and would
 *   clobber the repoint on every save. A targeted global's URL reads `locale`
 *   and never `data` for that reason.
 */
export const PreviewTarget: UIFieldClientComponent = ({ field }) => {
  const target = (field?.admin?.custom as { previewTarget?: PreviewTargetDeclaration } | undefined)
    ?.previewTarget

  const { isLivePreviewEnabled, setIsLivePreviewing, setURL, url } = useLivePreviewContext()

  /** The last URL this component handed to `setURL`. */
  const composedRef = useRef<string | null>(null)
  /** The server-resolved URL to restore on unmount. */
  const defaultUrlRef = useRef<string | null>(null)
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

  useEffect(() => {
    if (!isLivePreviewEnabled || !target?.autoOpen) return
    setIsLivePreviewing(true)
  }, [isLivePreviewEnabled, setIsLivePreviewing, target?.autoOpen])

  useEffect(() => {
    if (!isLivePreviewEnabled || !target) return

    if (url && url !== composedRef.current) defaultUrlRef.current = url
    const base = defaultUrlRef.current
    if (!base) return

    const composed = composeTargetUrl(base, target)
    if (!composed || composed === url) return

    composedRef.current = composed
    setURL(composed)
  }, [isLivePreviewEnabled, setURL, target, url])

  useEffect(
    () => () => {
      const restore = defaultUrlRef.current
      if (restore) setUrlRef.current(restore)
    },
    [],
  )

  return null
}

export default PreviewTarget
