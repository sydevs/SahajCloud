'use client'

import { Pill } from '@payloadcms/ui'
import React from 'react'

import {
  type RegionCounts,
  regionPillLabel,
  regionPillStyle,
  regionPillTooltip,
} from '@/lib/atlasSidebar/sidebarModel'

import { HoverTooltip } from './HoverTooltip'

// Payload's `Pill` keeps `font-size: 1rem` even at `size="small"`, which reads
// large in the nav. Nudge the font, line-height and inline padding down — the
// padding via the Pill's own `--pill-padding-*` vars — for a smaller-but-still-
// Pill badge. Inline styles override the (layered) class defaults.
const COMPACT = {
  // `em` (not `rem`) so the pill tracks the nav link font-size, which Payload
  // bumps from 13px to 17.5px on mobile (≤768px).
  fontSize: '0.8em',
  lineHeight: 1.5,
  // Never inherit the row's hover underline onto the pill text.
  textDecoration: 'none',
  '--pill-padding-inline-start': 'calc(var(--base) * 0.3)',
  '--pill-padding-inline-end': 'calc(var(--base) * 0.3)',
} as React.CSSProperties

// `elementProps` requires a ref; we don't need the node, so pass a stable no-op.
const noopRef = () => {}

/**
 * Region subtree event count: a single number (all published) or
 * `published/total`, coloured success/warning via Payload's `Pill`. Tooltip
 * spells out the count.
 */
export function CountPill({ counts }: { counts: RegionCounts }) {
  return (
    <HoverTooltip text={regionPillTooltip(counts)}>
      <Pill
        elementProps={{ ref: noopRef, style: COMPACT }}
        pillStyle={regionPillStyle(counts)}
        size="small"
      >
        {regionPillLabel(counts)}
      </Pill>
    </HoverTooltip>
  )
}
