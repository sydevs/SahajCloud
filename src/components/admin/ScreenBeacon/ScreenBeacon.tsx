'use client'

import type { UIFieldClientComponent } from 'payload'

import { useEffect } from 'react'

import './ScreenBeacon.css'

/**
 * Invisible per-tab signal for the translations live preview.
 *
 * Payload's native live preview streams the document to the harness iframe but
 * not the admin's active tab. This UI field is emitted once per previewable
 * leaf tab (see `createScreenBeaconField` in `src/fields/translationsField.ts`)
 * and, because Payload only mounts the active tab's fields, it announces its
 * screen id to the harness whenever its tab becomes active — so clicking a tab
 * switches the preview screen. Renders nothing.
 */
export const ScreenBeacon: UIFieldClientComponent = ({ field }) => {
  const screenId = (field?.admin?.custom as { screenId?: string } | undefined)?.screenId

  useEffect(() => {
    if (!screenId) return undefined

    const post = () => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[src*="preview/wm-app-translations"]',
      )
      iframe?.contentWindow?.postMessage({ type: 'wm-active-screen', screen: screenId }, '*')
    }

    // On mount (this tab is active). The iframe may not exist yet if live
    // preview is toggled off — that's a harmless no-op.
    post()

    // Re-announce when the harness signals it's ready (covers live preview
    // being toggled on while this tab was already active, and iframe reloads).
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; ready?: boolean } | string | null
      if (data && typeof data === 'object' && data.type === 'payload-live-preview' && data.ready) {
        post()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [screenId])

  return null
}

export default ScreenBeacon
