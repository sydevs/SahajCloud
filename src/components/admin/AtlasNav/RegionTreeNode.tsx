'use client'

import { Link } from '@payloadcms/ui'
import { ChevronRight, Plus } from 'lucide-react'
import { usePathname } from 'next/navigation'
import React, { useState } from 'react'

import type { RegionCounts, RegionLevel } from '@/lib/atlasSidebar/sidebarModel'
import {
  buildRegionCreateUrl,
  childLevelOf,
  regionLevelLabel,
} from '@/lib/atlasSidebar/sidebarModel'

import { CountPill } from './CountPill'
import { HoverTooltip } from './HoverTooltip'
import { activeDocId } from './navActive'
import styles from './RegionTreeNode.module.css'

/** Left padding for the whole tree, in `--base` units (inset from the headers). */
const BASE_INDENT = 0.5
/** Indent added per nesting level, in `--base` units (kept small for title room). */
const INDENT_PER_DEPTH = 0.5
/** How far the chevron hangs to the left of its row's label, in `--base` units. */
const CHEVRON_HANG = 0.85

/**
 * One region row, styled as a Payload `nav__link` (label flush with the headers,
 * no underline, same active treatment). The label link is only as wide as its
 * text and navigates to the region; clicking anywhere else on the row toggles
 * its children. The chevron is absolutely positioned so it hangs into the left
 * gutter rather than indenting the label. The open region is highlighted and its
 * ancestors auto-expand on load; a node with no siblings (a lone child/root)
 * also expands so single-child chains drill straight down.
 */
export function RegionTreeNode({
  id,
  name,
  level,
  counts,
  hasChildren,
  hasSiblings,
  depth,
  subtreeIds,
  children,
}: {
  id: number
  name: string
  level: RegionLevel
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
  const expanded = manualOpen ?? autoExpand
  const showPill = !hasChildren || !expanded
  // The level a child of this node would be; null for a center (a leaf), which
  // gets no "add child" affordance.
  const childLevel = childLevelOf(level)

  const indent = `calc(var(--base) * ${(BASE_INDENT + depth * INDENT_PER_DEPTH).toFixed(2)})`

  // The row toggles children; only the label link navigates. Leaf rows have
  // nothing to toggle, so they stay a plain (non-interactive) container.
  // `onMouseDown` preventDefault stops the row taking mouse focus — which would
  // otherwise bold it via Payload's `:focus:not(:focus-visible)` rule until blur.
  const rowToggleProps = hasChildren
    ? {
        'aria-expanded': expanded,
        onClick: () => setManualOpen(!expanded),
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setManualOpen(!expanded)
          }
        },
        onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
        role: 'button' as const,
        tabIndex: 0,
      }
    : {}

  return (
    <>
      <div
        className={`nav__link ${styles.row}`}
        {...rowToggleProps}
        style={{
          paddingInlineStart: indent,
          paddingInlineEnd: 0,
          // Small gap between the add-child + and the count pill (so neither
          // carries a margin) — lets the + sit flush-right with the pills when
          // alone. Kept small; most of the +↔pill separation is the +'s own
          // padding, which is also its (otherwise tiny) hover/tooltip target.
          columnGap: 'calc(var(--base) * 0.15)',
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
              size="1.1em"
              style={{
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.15s ease',
              }}
            />
          </span>
        ) : null}
        <Link
          className={`nav__link-label ${styles.label}`}
          href={`/admin/collections/regions/${id}`}
          onClick={(event: React.MouseEvent) => event.stopPropagation()}
          prefetch={false}
        >
          {name}
        </Link>
        {/* Fills the rest of the row; clicking it toggles (the row owns the click). */}
        <span aria-hidden style={{ flexGrow: 1, alignSelf: 'stretch' }} />
        {childLevel ? (
          <HoverTooltip text={`New ${regionLevelLabel(childLevel)}`}>
            <Link
              aria-label={`Add a new ${regionLevelLabel(childLevel)} under ${name}`}
              className={styles.addChild}
              href={buildRegionCreateUrl(id, childLevel)}
              onClick={(event: React.MouseEvent) => event.stopPropagation()}
              onMouseDown={(event: React.MouseEvent) => event.stopPropagation()}
              prefetch={false}
            >
              <Plus size="1.1em" />
            </Link>
          </HoverTooltip>
        ) : null}
        {showPill ? <CountPill counts={counts} /> : null}
      </div>
      {hasChildren && expanded ? children : null}
    </>
  )
}
