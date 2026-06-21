'use client'

import React from 'react'

import {
  type RegionCounts,
  regionPillLabel,
  regionPillStyle,
  regionPillTooltip,
} from '@/lib/atlasSidebar/sidebarModel'

import { HoverTooltip } from './HoverTooltip'

// A compact themed badge rather than @payloadcms/ui's `Pill`: even its `small`
// size reads too large against the nav rows (per design feedback). Colours come
// from the same admin `--theme-*` vars the Pill uses, so it stays on-theme.
const PALETTE: Record<'success' | 'warning', { background: string; color: string }> = {
  success: { background: 'var(--theme-success-100)', color: 'var(--theme-success-600)' },
  warning: { background: 'var(--theme-warning-100)', color: 'var(--theme-warning-600)' },
}

/**
 * Region subtree event count: a single number (all published) or
 * `published/total`, coloured success/warning. Tooltip spells out the count.
 */
export function CountPill({ counts }: { counts: RegionCounts }) {
  const palette = PALETTE[regionPillStyle(counts)]
  return (
    <HoverTooltip text={regionPillTooltip(counts)}>
      <span
        style={{
          flexShrink: 0,
          fontSize: '0.625rem',
          fontWeight: 600,
          lineHeight: 1,
          padding: '2px 5px',
          borderRadius: '8px',
          whiteSpace: 'nowrap',
          ...palette,
        }}
      >
        {regionPillLabel(counts)}
      </span>
    </HoverTooltip>
  )
}
