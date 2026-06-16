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
 * The icon is laid out inside the banner's content (not Payload's `icon` slot,
 * which is a bare flex row with no gap/alignment — fine for one-line banners but
 * it strands a small icon at the top-left beside multi-line text). A flex row
 * with `flex-shrink: 0` keeps the icon full-size and top-aligned with the title.
 */
export const InfoBanner: UIFieldClientComponent = ({ field }) => {
  const { icon, title, text, type = 'default' } = (field?.admin?.custom ?? {}) as InfoBannerConfig
  if (!title && !text) return null
  const Icon = icon ? ICONS[icon] : undefined
  return (
    <Banner type={type}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'calc(var(--base) * 0.5)' }}>
        {Icon ? (
          <span style={{ display: 'flex', flexShrink: 0, marginTop: '2px' }} aria-hidden>
            <Icon />
          </span>
        ) : null}
        <div>
          {title ? <div style={{ fontWeight: 600 }}>{title}</div> : null}
          {text ? <div>{text}</div> : null}
        </div>
      </div>
    </Banner>
  )
}

export default InfoBanner
