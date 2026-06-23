import { Plus } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

/**
 * A "Create Event" action at the bottom of the event list. Distinguished from
 * the event links by a leading + icon, an accent colour, and a top divider —
 * so it reads as an action, not another event. Only rendered when the manager
 * can create an event (owns ≥1 region); the access layer enforces the same.
 *
 * Uses lucide's `Plus` (not `@payloadcms/ui`'s `PlusIcon`) to match the sibling
 * `StageIcon`'s 16px lucide glyphs — `PlusIcon` is fixed at 20px with no size
 * prop, which would break this sidebar's icon rhythm.
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
        gap: 'calc(var(--base) * 0.4)',
        marginTop: 'calc(var(--base) * 0.3)',
        paddingTop: 'calc(var(--base) * 0.4)',
        borderTop: '1px solid var(--theme-elevation-100)',
        color: 'var(--theme-success-600)',
        fontWeight: 600,
      }}
    >
      <Plus size={16} aria-hidden style={{ flexShrink: 0 }} />
      <span className="nav__link-label" style={{ color: 'inherit' }}>
        Create Event
      </span>
    </Link>
  )
}
