'use client'

import type { UIFieldClientComponent } from 'payload'

import { Button, FieldLabel, useLivePreviewContext } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import { originOf } from '@/lib/utilities/url'

import { PREVIEW_MODE_MESSAGE } from './paletteReport'

const MODES = ['light', 'dark'] as const

type Mode = (typeof MODES)[number]

/**
 * Switches the preview between the atlas's light and dark looks.
 *
 * Not stored: it is a way of looking at the service's colours, not a setting
 * the service has. The mode is re-posted on every iframe load, because a reload
 * — a save, a region change — starts the atlas back on its own default.
 */
export const PreviewModeField: UIFieldClientComponent = () => {
  const { iframeRef } = useLivePreviewContext()
  const [mode, setMode] = useState<Mode>('light')

  const post = useCallback(
    (next: Mode) => {
      const frame = iframeRef?.current
      const origin = originOf(frame?.src ?? '')

      // The iframe's own origin, never a constant: the panel can be repointed at
      // the admin's explanation page, and that page is nobody's atlas.
      if (frame?.contentWindow && origin) {
        frame.contentWindow.postMessage({ mode: next, type: PREVIEW_MODE_MESSAGE }, origin)
      }
    },
    [iframeRef],
  )

  useEffect(() => {
    const frame = iframeRef?.current
    if (!frame) return

    const onLoad = () => post(mode)
    frame.addEventListener('load', onLoad)

    return () => frame.removeEventListener('load', onLoad)
  }, [iframeRef, mode, post])

  return (
    <div className="field-type">
      <FieldLabel label="Preview" />
      <div style={{ display: 'flex', gap: 'var(--base)' }}>
        {MODES.map((option) => (
          <Button
            buttonStyle={option === mode ? 'primary' : 'secondary'}
            key={option}
            onClick={() => {
              setMode(option)
              post(option)
            }}
            size="small"
          >
            {option === 'light' ? 'Light' : 'Dark'}
          </Button>
        ))}
      </div>
    </div>
  )
}

export default PreviewModeField
