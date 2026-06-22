'use client'

import { Tooltip } from '@payloadcms/ui'
import React, { useState } from 'react'

/**
 * Shows a Payload `Tooltip` on hover/focus of its trigger — the canonical
 * Payload pattern (cf. the `Locked` element, which drives `Tooltip.show` from
 * a `hovered` state). Used for the sidebar's stage icons and region count pills.
 */
export function HoverTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <span
      onBlur={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
    >
      <Tooltip alignCaret="right" position="top" show={hovered}>
        {text}
      </Tooltip>
      {children}
    </span>
  )
}
