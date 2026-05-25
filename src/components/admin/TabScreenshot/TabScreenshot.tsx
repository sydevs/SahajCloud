'use client'

import type { UIFieldClientComponent } from 'payload'

import React from 'react'

/**
 * Renders an orientation aid above a translations tab — either an image
 * (when `screenshot` is a relative path or an image URL) or a clickable
 * link (when `screenshot` is a Figma design URL).
 *
 * Wired in by `buildTranslationTabs` whenever a leaf group declares a
 * `screenshot` in `translationsSchema.json`. UI-only — does not read or
 * write any field data.
 *
 * Eventually intended to be replaced by a live in-CMS preview of the
 * Flutter screen.
 */
export const TabScreenshot: UIFieldClientComponent = ({ field }) => {
  const custom = field?.admin?.custom as
    | { screenshot?: string; caption?: string }
    | undefined

  const src = custom?.screenshot
  if (!src) return null

  const isFigmaUrl = /^https?:\/\/(?:www\.)?figma\.com\//i.test(src)
  const looksLikeImage =
    src.startsWith('/') || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(src)

  return (
    <div
      style={{
        marginBottom: '1.25rem',
        padding: '0.75rem',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '4px',
        backgroundColor: 'var(--theme-elevation-50)',
      }}
    >
      {looksLikeImage && !isFigmaUrl ? (
        <a href={src} target="_blank" rel="noopener noreferrer">
          <img
            src={src}
            alt={custom?.caption || 'Screen preview'}
            style={{
              display: 'block',
              maxHeight: '380px',
              maxWidth: '100%',
              height: 'auto',
              borderRadius: '2px',
            }}
          />
        </a>
      ) : isFigmaUrl ? (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: '4px',
            textDecoration: 'none',
            fontSize: '0.85rem',
          }}
        >
          <span aria-hidden>🎨</span>
          <span>View this screen in Figma</span>
          <span aria-hidden>↗</span>
        </a>
      ) : (
        <a href={src} target="_blank" rel="noopener noreferrer">
          {src}
        </a>
      )}
    </div>
  )
}

export default TabScreenshot
