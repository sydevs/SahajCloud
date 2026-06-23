import { NavGroup } from '@payloadcms/ui'
import React from 'react'

import type { SidebarEventItem } from '@/lib/atlasSidebar/sidebarModel'

import { CreateEventButton } from './CreateEventButton'
import { EventRow } from './EventRow'
import { ShowMore } from './ShowMore'

/** Show this many event rows before collapsing the rest behind "Show more". */
const COLLAPSE_AFTER = 8

/**
 * The manager's events, bucket-ordered, under a collapsible nav group that
 * matches the default nav's section headers, with a "Create Event" action when
 * they can create one. Hidden only when they own no events and can't create.
 */
export function EventList({
  events,
  canCreate,
}: {
  events: SidebarEventItem[]
  canCreate: boolean
}) {
  if (!events.length && !canCreate) return null
  const visible = events.slice(0, COLLAPSE_AFTER)
  const overflow = events.slice(COLLAPSE_AFTER)
  return (
    <NavGroup label="Your Events">
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
      {canCreate ? <CreateEventButton /> : null}
    </NavGroup>
  )
}
