'use client'

import { Pill } from '@payloadcms/ui'
import React from 'react'

import {
  hasUnpublished,
  type RegionCounts,
  regionPillTooltip,
} from '@/lib/atlasSidebar/sidebarModel'

import { HoverTooltip } from './HoverTooltip'

/**
 * `published/total` events summed over a region's subtree. Coloured `warning`
 * when some events are unpublished (expired); the tooltip spells out the count.
 */
export function CountPill({ counts }: { counts: RegionCounts }) {
  return (
    <HoverTooltip text={regionPillTooltip(counts)}>
      <Pill pillStyle={hasUnpublished(counts) ? 'warning' : 'light'} size="small">
        {counts.published}/{counts.total}
      </Pill>
    </HoverTooltip>
  )
}
