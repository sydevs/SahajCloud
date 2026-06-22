'use client'

import { Link } from '@payloadcms/ui'
import { ChevronRight } from 'lucide-react'
import { usePathname } from 'next/navigation'
import React, { useState } from 'react'

import type { RegionCounts } from '@/lib/atlasSidebar/sidebarModel'

import { CountPill } from './CountPill'
import { activeDocId } from './navActive'

/** Indent added per nesting level, in `--base` units (kept small for title room). */
const INDENT_PER_DEPTH = 0.5
/** How far the chevron hangs to the left of its row's label, in `--base` units. */
const CHEVRON_HANG = 0.85
/** Trimmed right gutter (Payload's default `nav__link` reserves 30px). */
const RIGHT_PAD = 'calc(var(--base) * 0.3)'

/**
 * One region row, styled as a Payload `nav__link` (label flush with the headers,
 * no underline, same active treatment). Clicking anywhere on the row toggles its
 * children; only the label link navigates to the region. The chevron is absolutely
 * positioned so it hangs into the left gutter rather than indenting the label.
 * The open region is highlighted and its ancestors auto-expand on load; a node
 * with no siblings (a lone child/root) also expands so single-child chains drill
 * straight down.
 */
export function RegionTreeNode({
  id,
  name,
  counts,
  hasChildren,
  hasSiblings,
  depth,
  subtreeIds,
  children,
}: {
  id: number
  name: string
  counts: RegionCounts
  hasChildren: boolean
  /** Whether this node shares its level with other nodes (under the same parent). */
  hasSiblings: boolean
  depth: number
  subtreeIds: number[]
  children?: React.ReactNode
}) {
  const activeRegionId = activeDocId(usePathname(), 'regions')
  const isActive = activeRegionId === id
  const activeInSubtree = activeRegionId !== null && subtreeIds.includes(activeRegionId)
  const autoExpand = hasChildren && (activeInSubtree || !hasSiblings)
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const [labelHover, setLabelHover] = useState(false)
  const expanded = manualOpen ?? autoExpand
  const showPill = !hasChildren || !expanded
  const toggle = () => setManualOpen(!expanded)

  const indent = `calc(var(--base) * ${(depth * INDENT_PER_DEPTH).toFixed(2)})`

  // Clicking the row toggles children; only the label navigates. Leaf rows have
  // nothing to toggle, so they stay a plain (non-interactive) container.
  const rowToggleProps = hasChildren
    ? {
        'aria-expanded': expanded,
        onClick: toggle,
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggle()
          }
        },
        role: 'button' as const,
        tabIndex: 0,
      }
    : {}

  return (
    <>
      <div
        className="nav__link"
        {...rowToggleProps}
        style={{
          paddingInlineStart: indent,
          paddingInlineEnd: RIGHT_PAD,
          cursor: hasChildren ? 'pointer' : 'default',
        }}
      >
        {isActive ? <div className="nav__link-indicator" /> : null}
        {hasChildren ? (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              insetInlineStart: `calc(${indent} - var(--base) * ${CHEVRON_HANG})`,
              top: 0,
              bottom: 0,
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--theme-elevation-500)',
            }}
          >
            <ChevronRight
              size={14}
              style={{
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            />
          </span>
        ) : null}
        <Link
          className="nav__link-label"
          href={`/admin/collections/regions/${id}`}
          onBlur={() => setLabelHover(false)}
          onClick={(event: React.MouseEvent) => event.stopPropagation()}
          onFocus={() => setLabelHover(true)}
          onMouseEnter={() => setLabelHover(true)}
          onMouseLeave={() => setLabelHover(false)}
          prefetch={false}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'inherit',
            textDecoration: labelHover ? 'underline' : 'none',
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
