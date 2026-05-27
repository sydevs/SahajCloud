'use client'

import type { UIFieldClientComponent } from 'payload'

import { Button } from '@payloadcms/ui'
import React from 'react'

/**
 * Renders an orientation aid above a translations tab — either an image
 * (when `screenshot` is a relative path or an image URL) or a Payload
 * `Button` link (when `screenshot` is a Figma design URL).
 *
 * Wired in by `buildTranslationTabs` whenever a leaf group declares a
 * `screenshot` in `translationsSchema.json`. UI-only — does not read or
 * write any field data. Eventually intended to be replaced by a live
 * in-CMS preview of the Flutter screen.
 */
export const TabScreenshot: UIFieldClientComponent = ({ field }) => {
  const custom = field?.admin?.custom as { screenshot?: string; caption?: string } | undefined

  const src = custom?.screenshot
  if (!src) return null

  const isFigmaUrl = /^https?:\/\/(?:www\.)?figma\.com\//i.test(src)
  const looksLikeImage = src.startsWith('/') || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(src)

  if (looksLikeImage && !isFigmaUrl) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer">
        <img
          src={src}
          alt={custom?.caption || 'Screen preview'}
          style={{
            display: 'block',
            maxHeight: '380px',
            maxWidth: '100%',
            height: 'auto',
            borderRadius: 'var(--style-radius-s)',
          }}
        />
      </a>
    )
  }

  if (isFigmaUrl) {
    return (
      <Button el="anchor" url={src} newTab buttonStyle="secondary" size="small">
        View this screen in Figma ↗
      </Button>
    )
  }

  return (
    <a href={src} target="_blank" rel="noopener noreferrer">
      {src}
    </a>
  )
}

export default TabScreenshot
