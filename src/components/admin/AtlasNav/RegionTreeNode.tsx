'use client'

import { Link } from '@payloadcms/ui'
import { ChevronRight } from 'lucide-react'
import React, { useState } from 'react'

import type { RegionCounts } from '@/lib/atlasSidebar/sidebarModel'

import { CountPill } from './CountPill'

/**
 * One region row. Non-leaf nodes get a rotating chevron that toggles their
 * children (server-rendered, passed as `children`). The subtree count pill
 * shows when the node is a leaf or collapsed — i.e. whenever its children
 * aren't on screen to speak for themselves.
 */
export function RegionTreeNode({
  id,
  name,
  counts,
  hasChildren,
  depth,
  children,
}: {
  id: number
  name: string
  counts: RegionCounts
  hasChildren: boolean
  depth: number
  children?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const showPill = !hasChildren || !expanded
  return (
    <li>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'calc(var(--base) * 0.3)',
          paddingLeft: `calc(var(--base) * ${(0.4 + depth * 0.6).toFixed(2)})`,
        }}
      >
        {hasChildren ? (
          <button
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
            onClick={() => setExpanded((value) => !value)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              padding: 0,
              color: 'var(--theme-elevation-500)',
            }}
            type="button"
          >
            <ChevronRight
              size={14}
              style={{
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            />
          </button>
        ) : (
          <span aria-hidden style={{ width: 14, flexShrink: 0 }} />
        )}
        <Link
          className="nav__link-label"
          href={`/admin/collections/regions/${id}`}
          prefetch={false}
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </Link>
        {showPill ? <CountPill counts={counts} /> : null}
      </div>
      {hasChildren && expanded ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{children}</ul>
      ) : null}
    </li>
  )
}
