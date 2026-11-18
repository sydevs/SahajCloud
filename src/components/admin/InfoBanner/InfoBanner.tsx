'use client'

import { Banner, Button, ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '@payloadcms/ui'
import React from 'react'

/** The `Banner` types Payload styles: `info` has no rule of its own, so it is `default`. */
export type InfoBannerType = 'default' | 'error' | 'success' | 'warning'

const TYPE_ICONS: Record<InfoBannerType, React.FC> = {
  default: InfoIcon,
  error: ErrorIcon,
  success: SuccessIcon,
  warning: WarningIcon,
}

/**
 * A banner's one action, drawn the same way everywhere: a small secondary
 * button, after the description. `href` makes it a link styled as that button,
 * which a server component can pass; `onClick` needs a client one.
 */
export type InfoBannerAction =
  { label: string; href: string } | { label: string; onClick: () => void; disabled?: boolean }

export interface InfoBannerProps {
  type?: InfoBannerType
  /** Replaces the type's own icon; `null` shows none. */
  icon?: React.ReactNode | null
  title?: React.ReactNode
  /** The description, one or two short sentences. */
  children?: React.ReactNode
  action?: InfoBannerAction
}

/**
 * Payload's `Banner` with an icon, a bold title and a short description — the
 * one notice shape the admin panel uses.
 *
 * The icon sits inside the content rather than in `Banner`'s own `icon` slot,
 * which is a bare flex row with no gap or alignment: fine beside one line, but
 * beside a title and a sentence it strands a small icon at the top left.
 */
export function InfoBanner({
  type = 'default',
  icon,
  title,
  children,
  action,
}: InfoBannerProps): React.ReactElement | null {
  const Icon = TYPE_ICONS[type]
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
          {action ? (
            <div style={{ marginTop: 'calc(var(--base) * 0.5)' }}>
              <ActionButton action={action} />
            </div>
          ) : null}
        </div>
      </div>
    </Banner>
  )
}

function ActionButton({ action }: { action: InfoBannerAction }) {
  if ('href' in action) {
    return (
      <Button buttonStyle="secondary" el="link" margin={false} size="small" url={action.href}>
        {action.label}
      </Button>
    )
  }
  return (
    <Button
      buttonStyle="secondary"
      disabled={action.disabled}
      margin={false}
      onClick={action.onClick}
      size="small"
    >
      {action.label}
    </Button>
  )
}
