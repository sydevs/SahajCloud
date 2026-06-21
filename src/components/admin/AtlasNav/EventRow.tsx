'use client'

import { Link } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import React from 'react'

import type { SidebarEventItem } from '@/lib/atlasSidebar/sidebarModel'

import { isActivePath } from './navActive'
import { StageIcon } from './StageIcon'

/** Shared full-width row layout so stage icons right-align uniformly. */
const rowStyle: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  gap: 'calc(var(--base) * 0.4)',
}

/**
 * One event row — a Payload `nav__link` (so padding/hover/active match the
 * default nav) with the title left and a right-floated stage icon. Highlights
 * (and becomes non-navigable) when its event is the open document.
 */
export function EventRow({ event }: { event: SidebarEventItem }) {
  const href = `/admin/collections/events/${event.id}`
  const isActive = isActivePath(usePathname(), href)

  const content = (
    <>
      {isActive ? <div className="nav__link-indicator" /> : null}
      <span
        className="nav__link-label"
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {event.title}
      </span>
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>
        <StageIcon bucket={event.bucket} />
      </span>
    </>
  )

  if (isActive) {
    return (
      <div className="nav__link" style={rowStyle}>
        {content}
      </div>
    )
  }
  return (
    <Link className="nav__link" href={href} prefetch={false} style={rowStyle}>
      {content}
    </Link>
  )
}
