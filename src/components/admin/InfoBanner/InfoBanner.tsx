'use client'

import type { UIFieldClientProps } from 'payload'

import { Banner, Button, ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '@payloadcms/ui'
import { GraduationCap } from 'lucide-react'
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
 * The icons a `ui` field can name in `admin.custom`, which is serialized and so
 * holds a string. Payload ships no teaching glyph, so `tutorial` is lucide's,
 * sized to sit beside Payload's own ~24px icons.
 */
const NAMED_ICONS: Record<string, React.FC> = {
  tutorial: () => <GraduationCap size={22} aria-hidden />,
  info: InfoIcon,
  warning: WarningIcon,
}

/** A `ui` field's `admin.custom`: `{ icon?: 'tutorial' | 'info' | 'warning', title?, text?, type? }`. */
interface InfoBannerConfig {
  icon?: string
  title?: string
  text?: string
  type?: InfoBannerType | 'info'
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
  /** Set when registered as a `ui` field, which configures the banner through `admin.custom`. */
  field?: UIFieldClientProps['field']
}

function fromField(field: UIFieldClientProps['field']): InfoBannerProps | null {
  const { icon, title, text, type = 'default' } = (field?.admin?.custom ?? {}) as InfoBannerConfig
  if (!title && !text) return null
  const Icon = icon ? NAMED_ICONS[icon] : undefined
  return {
    icon: Icon ? <Icon /> : null,
    title,
    children: text,
    type: type === 'info' ? 'default' : type,
  }
}

/**
 * Payload's `Banner` with an icon, a bold title and a short description — the
 * one notice shape the admin panel uses.
 *
 * The icon sits inside the content rather than in `Banner`'s own `icon` slot,
 * which is a bare flex row with no gap or alignment: fine beside one line, but
 * beside a title and a sentence it strands a small icon at the top left.
 */
export function InfoBanner({ field, ...props }: InfoBannerProps): React.ReactElement | null {
  const banner = field ? fromField(field) : props
  if (!banner) return null
  const { type = 'default', icon, title, children, action } = banner
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

export default InfoBanner
