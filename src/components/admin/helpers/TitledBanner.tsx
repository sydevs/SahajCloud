'use client'

import { Banner, ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '@payloadcms/ui'
import React from 'react'

/** The `Banner` types Payload styles: `info` has no rule of its own, so it is `default`. */
export type TitledBannerType = 'default' | 'error' | 'success' | 'warning'

const ICONS: Record<TitledBannerType, React.FC> = {
  default: InfoIcon,
  error: ErrorIcon,
  success: SuccessIcon,
  warning: WarningIcon,
}

/**
 * Payload's `Banner` with an icon, a bold title and a short description — the
 * one notice shape the admin panel uses.
 *
 * The icon sits inside the content rather than in `Banner`'s own `icon` slot,
 * which is a bare flex row with no gap or alignment: fine beside one line, but
 * beside a title and a sentence it strands a small icon at the top left. The
 * icon defaults to Payload's own toast icon for the type, theme-coloured.
 */
export function TitledBanner({
  type = 'default',
  icon,
  title,
  children,
  action,
}: {
  type?: TitledBannerType
  /** Replaces the type's own icon; `null` shows none. */
  icon?: React.ReactNode | null
  title?: React.ReactNode
  /** The description, one or two short sentences. */
  children?: React.ReactNode
  /** A link or button after the description. */
  action?: React.ReactNode
}): React.ReactElement {
  const Icon = ICONS[type]
  return (
    <Banner type={type}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'calc(var(--base) * 0.5)' }}>
        {icon === null ? null : (
          <span aria-hidden style={{ display: 'flex', flexShrink: 0, marginTop: '2px' }}>
            {icon ?? <Icon />}
          </span>
        )}
        <div>
          {title ? <div style={{ fontWeight: 600 }}>{title}</div> : null}
          {children ? <div>{children}</div> : null}
          {action ? <div style={{ marginTop: 'calc(var(--base) * 0.25)' }}>{action}</div> : null}
        </div>
      </div>
    </Banner>
  )
}

export default TitledBanner
