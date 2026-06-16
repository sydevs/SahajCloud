'use client'

import type { UIFieldClientComponent } from 'payload'

import { Banner, InfoIcon, WarningIcon } from '@payloadcms/ui'
import { GraduationCap } from 'lucide-react'
import React from 'react'

/** Banner variants supported by Payload's `Banner`. */
type BannerType = 'default' | 'error' | 'info' | 'success'

interface InfoBannerConfig {
  /** Named icon — a string, since `admin.custom` is serialized to the client. */
  icon?: string
  title?: string
  text?: string
  type?: BannerType
}

/**
 * Icon registry — `custom.icon` is a string, so it maps to a component here.
 * `tutorial` uses lucide's GraduationCap (Payload's icon set ships no teaching
 * glyph); the rest reuse Payload's own theme-coloured icons. lucide inherits
 * the banner's text colour via `currentColor`, so it themes correctly in admin.
 */
const ICONS: Record<string, React.FC> = {
  tutorial: () => <GraduationCap size={18} aria-hidden />,
  info: InfoIcon,
  warning: WarningIcon,
}

/**
 * Generic informational `Banner` for a `ui` field — configured entirely through
 * the field's `admin.custom`:
 *   { icon?: 'tutorial' | 'info' | 'warning', title?, text?, type? }
 * Renders an optional icon, a bold title, and body text. Reusable wherever a
 * static admin notice is wanted, with no per-use component code.
 */
export const InfoBanner: UIFieldClientComponent = ({ field }) => {
  const { icon, title, text, type = 'default' } = (field?.admin?.custom ?? {}) as InfoBannerConfig
  if (!title && !text) return null
  const Icon = icon ? ICONS[icon] : undefined
  return (
    <Banner type={type} icon={Icon ? <Icon /> : undefined} alignIcon="left">
      {title ? <strong>{title}</strong> : null}
      {title && text ? <br /> : null}
      {text}
    </Banner>
  )
}

export default InfoBanner
