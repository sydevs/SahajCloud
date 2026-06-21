'use client'

import { Link } from '@payloadcms/ui'
import { ChevronRight } from 'lucide-react'
import { usePathname } from 'next/navigation'
import React, { useState } from 'react'

import type { RegionCounts } from '@/lib/atlasSidebar/sidebarModel'

import { CountPill } from './CountPill'
import { activeDocId } from './navActive'

/**
 * One region row, styled as a Payload `nav__link` so padding/hover/active match
 * the default nav. Rendered as flat (indented) rows — not nested `ul`/`li` — so
 * the right-floated pills line up with the event rows' stage icons. Non-leaf
 * nodes get a rotating chevron toggling their (server-rendered) children; the
 * subtree count pill shows when the node is a leaf or collapsed. Highlights the
 * open region and auto-expands its ancestors on load (any node whose subtree
 * contains the open region starts expanded).
 */
export function RegionTreeNode({
  id,
  name,
  counts,
  hasChildren,
  depth,
  subtreeIds,
  children,
}: {
  id: number
  name: string
  counts: RegionCounts
  hasChildren: boolean
  depth: number
  subtreeIds: number[]
  children?: React.ReactNode
}) {
  const activeRegionId = activeDocId(usePathname(), 'regions')
  const isActive = activeRegionId === id
  const autoExpand = hasChildren && activeRegionId !== null && subtreeIds.includes(activeRegionId)
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const expanded = manualOpen ?? autoExpand
  const showPill = !hasChildren || !expanded

  return (
    <>
      <div
        className="nav__link"
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: 'calc(var(--base) * 0.3)',
        }}
      >
        {isActive ? <div className="nav__link-indicator" /> : null}
        {depth > 0 ? (
          <span
            aria-hidden
            style={{ width: `calc(var(--base) * ${depth * 0.75})`, flexShrink: 0 }}
          />
        ) : null}
        {hasChildren ? (
          <button
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
            onClick={() => setManualOpen(!expanded)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              padding: 0,
              flexShrink: 0,
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
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </Link>
        {showPill ? <CountPill counts={counts} /> : null}
      </div>
      {hasChildren && expanded ? children : null}
    </>
  )
}
