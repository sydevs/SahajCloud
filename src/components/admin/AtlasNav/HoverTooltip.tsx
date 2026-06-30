'use client'

import { Tooltip } from '@payloadcms/ui'
import React, { useState } from 'react'

/**
 * Shows a Payload `Tooltip` on hover/focus of its trigger — the canonical
 * Payload pattern (cf. the `Locked` element, which drives `Tooltip.show` from
 * a `hovered` state). Used for the sidebar's stage icons and region count pills.
 */
export function HoverTooltip({
  text,
  alignCaret = 'right',
  delay = 0,
  children,
}: {
  text: string
  /**
   * Where the caret sits within the tooltip box. The box is always centred on
   * the trigger, so `center` points the caret right at a narrow trigger (the +
   * button); `right` (default) suits wider triggers near the panel edge (pills).
   */
  alignCaret?: 'center' | 'left' | 'right'
  /**
   * Show delay in ms. Payload's `Tooltip` defaults to 350ms, which on these
   * small nav triggers reads as "no tooltip" — a brief hover never reaches it.
   * Default to 0 (instant) here.
   */
  delay?: number
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <span
      onBlur={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
    >
      <Tooltip alignCaret={alignCaret} delay={delay} position="top" show={hovered}>
        {text}
      </Tooltip>
      {children}
    </span>
  )
}
