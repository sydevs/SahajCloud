import { Plus } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

/**
 * A small "New Event" action at the bottom of the event list. Distinguished
 * from the event links by a leading + icon and an accent colour (and by being
 * smaller), so it reads as an action, not another event. Only rendered when the
 * manager can create an event (owns ≥1 region); the access layer enforces the same.
 *
 * Uses lucide's `Plus` (not `@payloadcms/ui`'s `PlusIcon`) to match the sibling
 * `StageIcon`'s lucide glyphs — `PlusIcon` is fixed at 20px with no size prop,
 * which would break this sidebar's icon rhythm.
 */
export function CreateEventButton() {
  return (
    <Link
      className="nav__link"
      href="/admin/collections/events/create"
      prefetch={false}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(var(--base) * 0.35)',
        paddingBlock: 'calc(var(--base) * 0.3)',
        color: 'var(--theme-success-600)',
        fontSize: '0.9rem',
        fontWeight: 600,
      }}
    >
      <Plus size={15} aria-hidden style={{ flexShrink: 0 }} />
      <span className="nav__link-label" style={{ color: 'inherit', fontSize: 'inherit' }}>
        New Event
      </span>
    </Link>
  )
}
