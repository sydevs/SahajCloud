'use client'

import { Button } from '@payloadcms/ui'
import { useParams, usePathname } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

/**
 * Payload's own document-tab markup — a `tab`-style `Button` with the `doc-tab`
 * classes, disabled while it is the open tab — because the component Payload
 * renders its default tabs with is not exported. Built from the route's own
 * segments, as Payload's is, so it lands on this document's Install view.
 */
export function InstallTabLink({
  adminRoute,
  path,
}: {
  adminRoute: string
  path: string
}): React.ReactElement {
  const pathname = usePathname() ?? ''
  const params = useParams<{ segments?: string[] }>()
  const [, slug, id] = params.segments ?? []
  const href = formatAdminURL({ adminRoute, path: `/collections/${slug}/${id}${path}` })
  const active = pathname.startsWith(href)

  return (
    <Button
      aria-label="Install"
      buttonStyle="tab"
      className={['doc-tab', active && 'doc-tab--active'].filter(Boolean).join(' ')}
      disabled={active}
      el={active ? 'div' : 'link'}
      margin={false}
      size="medium"
      to={active ? undefined : href}
    >
      <span className="doc-tab__label">Install</span>
    </Button>
  )
}
