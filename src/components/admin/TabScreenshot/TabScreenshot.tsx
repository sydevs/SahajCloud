'use client'

import type { UIFieldClientComponent } from 'payload'

import { Button } from '@payloadcms/ui'
import React from 'react'

/**
 * Renders an orientation aid above a translations tab — a link to the
 * Figma design or other reference URL for the screen being translated.
 *
 * Wired in by `buildTranslationTabs` whenever a leaf group declares a
 * `screenshot` in `translationsSchema.json`. UI-only — does not read or
 * write any field data.
 */
export const TabScreenshot: UIFieldClientComponent = ({ field }) => {
  const custom = field?.admin?.custom as { screenshot?: string; caption?: string } | undefined

  const src = custom?.screenshot
  if (!src) return null

  const isFigmaUrl = /^https?:\/\/(?:www\.)?figma\.com\//i.test(src)
  const label = isFigmaUrl ? 'View in Figma' : (custom?.caption ?? 'View screen reference')

  return (
    <Button el="anchor" url={src} newTab buttonStyle="secondary" size="small">
      {label} ↗
    </Button>
  )
}

export default TabScreenshot
