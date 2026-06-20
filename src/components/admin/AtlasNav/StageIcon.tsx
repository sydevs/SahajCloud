'use client'

import {
  BellRing,
  CircleCheck,
  Clock,
  Flag,
  TriangleAlert,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import React from 'react'

import { type EventBucket, EVENT_BUCKET_META } from '@/lib/atlasSidebar/sidebarModel'

import { HoverTooltip } from './HoverTooltip'

/** One distinct glyph per bucket — `urgent` reads as an alert, the rest scan apart. */
const BUCKET_ICON: Record<EventBucket, LucideIcon> = {
  urgent: TriangleAlert,
  needsVerification: BellRing,
  expired: Clock,
  verified: CircleCheck,
  trashed: Trash2,
  finished: Flag,
}

/** Theme-aware colours (resolve per light/dark via the admin `--theme-*` vars). */
const BUCKET_COLOR: Record<EventBucket, string> = {
  urgent: 'var(--theme-error-500)',
  needsVerification: 'var(--theme-warning-500)',
  expired: 'var(--theme-elevation-500)',
  verified: 'var(--theme-success-500)',
  trashed: 'var(--theme-elevation-400)',
  finished: 'var(--theme-elevation-600)',
}

/** Right-floated stage glyph for an event row, with a tooltip describing the bucket. */
export function StageIcon({ bucket }: { bucket: EventBucket }) {
  const Icon = BUCKET_ICON[bucket]
  const meta = EVENT_BUCKET_META[bucket]
  return (
    <HoverTooltip text={meta.tooltip}>
      <Icon aria-label={meta.label} color={BUCKET_COLOR[bucket]} size={16} />
    </HoverTooltip>
  )
}
