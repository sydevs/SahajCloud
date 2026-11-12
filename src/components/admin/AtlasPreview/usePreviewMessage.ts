'use client'

import { useLivePreviewContext } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { originOf } from '@/lib/utilities/url'

/**
 * The preview's latest message, or `null` before one arrives.
 *
 * ⚠ **The sender is checked as each message arrives**, against the preview
 * iframe as it is then. Nothing about the frame is captured at mount, so a panel
 * that opens after this field, reloads or is repointed needs no re-subscribe.
 */
export function usePreviewMessage(): unknown {
  const { iframeRef } = useLivePreviewContext()
  const [message, setMessage] = useState<unknown>(null)

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef?.current

      if (!frame?.contentWindow || event.source !== frame.contentWindow) return
      if (event.origin !== originOf(frame.src)) return

      setMessage(event.data)
    }

    window.addEventListener('message', onMessage)

    return () => window.removeEventListener('message', onMessage)
  }, [iframeRef])

  return message
}
