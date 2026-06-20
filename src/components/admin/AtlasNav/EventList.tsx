import Link from 'next/link'
import React from 'react'

import type { SidebarEventItem } from '@/lib/atlasSidebar/sidebarModel'

import { SectionLabel } from './SectionLabel'
import { ShowMore } from './ShowMore'
import { StageIcon } from './StageIcon'

/** Show this many event rows before collapsing the rest behind "Show more". */
const COLLAPSE_AFTER = 8

function EventRow({ event }: { event: SidebarEventItem }) {
  return (
    <Link
      className="nav__link"
      href={`/admin/collections/events/${event.id}`}
      prefetch={false}
      style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--base) * 0.4)' }}
    >
      <span
        className="nav__link-label"
        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {event.title}
      </span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', flexShrink: 0 }}>
        <StageIcon bucket={event.bucket} />
      </span>
    </Link>
  )
}

/** The manager's events, bucket-ordered, hidden entirely when they own none. */
export function EventList({ events }: { events: SidebarEventItem[] }) {
  if (!events.length) return null
  const visible = events.slice(0, COLLAPSE_AFTER)
  const overflow = events.slice(COLLAPSE_AFTER)
  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <SectionLabel>Events</SectionLabel>
      {visible.map((event) => (
        <EventRow event={event} key={event.id} />
      ))}
      {overflow.length > 0 ? (
        <ShowMore count={overflow.length}>
          {overflow.map((event) => (
            <EventRow event={event} key={event.id} />
          ))}
        </ShowMore>
      ) : null}
    </div>
  )
}
