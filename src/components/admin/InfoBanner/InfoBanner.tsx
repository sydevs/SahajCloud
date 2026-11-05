'use client'

import type { UIFieldClientComponent } from 'payload'

import { InfoIcon, WarningIcon } from '@payloadcms/ui'
import { GraduationCap } from 'lucide-react'
import React from 'react'

import { TitledBanner } from '@/components/admin/helpers/TitledBanner'

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
 * glyph) sized to sit alongside Payload's own ~24px icons; it inherits the
 * banner's text colour via `currentColor`. `info`/`warning` reuse Payload's
 * theme-coloured icons.
 */
const ICONS: Record<string, React.FC> = {
  tutorial: () => <GraduationCap size={22} aria-hidden />,
  info: InfoIcon,
  warning: WarningIcon,
}

/**
 * Generic informational `Banner` for a `ui` field — configured entirely through
 * the field's `admin.custom`:
 *   { icon?: 'tutorial' | 'info' | 'warning', title?, text?, type? }
 *
 * Laid out by `TitledBanner`, the admin panel's one notice shape.
 */
export const InfoBanner: UIFieldClientComponent = ({ field }) => {
  const { icon, title, text, type = 'default' } = (field?.admin?.custom ?? {}) as InfoBannerConfig
  if (!title && !text) return null
  const Icon = icon ? ICONS[icon] : undefined
  return (
    <TitledBanner
      icon={Icon ? <Icon /> : null}
      title={title}
      type={type === 'info' ? 'default' : type}
    >
      {text}
    </TitledBanner>
  )
}

export default InfoBanner
