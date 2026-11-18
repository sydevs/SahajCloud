'use client'

import type { UIFieldClientProps } from 'payload'

import { InfoIcon, useConfig, useDocumentInfo, WarningIcon } from '@payloadcms/ui'
import { GraduationCap } from 'lucide-react'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { InfoBanner, type InfoBannerAction, type InfoBannerType } from './InfoBanner'

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

/**
 * A `ui` field's `admin.custom`. It is serialized, so every value here is
 * **data** — the action names a path on the document being edited, never a URL
 * and never a callback.
 */
interface InfoBannerConfig {
  icon?: string
  title?: string
  text?: string
  type?: InfoBannerType | 'info'
  action?: { label: string; path: string }
}

/**
 * `InfoBanner` as a `ui` field, configured through `admin.custom`.
 *
 * The wrapper exists because resolving the action needs the document's own id
 * and the admin route, and both arrive from providers — which would otherwise
 * make every mount of the plain banner, in any surface, depend on them.
 */
export function InfoBannerField({ field }: UIFieldClientProps): React.ReactElement | null {
  const { collectionSlug, id } = useDocumentInfo()
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()

  const {
    icon,
    title,
    text,
    type = 'default',
    action,
  } = (field?.admin?.custom ?? {}) as InfoBannerConfig
  if (!title && !text) return null
  const Icon = icon ? NAMED_ICONS[icon] : undefined

  return (
    <InfoBanner
      action={documentAction(action, { adminRoute, collectionSlug, id })}
      icon={Icon ? <Icon /> : null}
      title={title}
      type={type === 'info' ? 'default' : type}
    >
      {text}
    </InfoBanner>
  )
}

/**
 * The declared action as a link to one of this document's own views.
 *
 * Dropped before the document exists: an unsaved one has no address to open, so
 * a field whose banner needs one carries `hideUntilCreated` as well.
 * `formatAdminURL` is Payload's own joiner, and the route comes from the live
 * config rather than a second copy of `/admin`.
 */
function documentAction(
  action: InfoBannerConfig['action'],
  {
    adminRoute,
    collectionSlug,
    id,
  }: { adminRoute: string; collectionSlug?: string; id?: number | string | null },
): InfoBannerAction | undefined {
  if (!action || !collectionSlug || id == null) return undefined
  return {
    label: action.label,
    href: formatAdminURL({
      adminRoute,
      path: `/collections/${collectionSlug}/${id}${action.path}`,
    }),
  }
}

export default InfoBannerField
