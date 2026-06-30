'use client'

import { Tooltip } from '@payloadcms/ui'
import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Shows a Payload `Tooltip` on hover/focus of its trigger, rendered through a
 * portal to `document.body` so the nav's scroll container (`.nav__scroll`,
 * `overflow: auto`) can't clip it. Positioned `fixed` over the trigger's
 * top-centre, caret centred on the trigger.
 *
 * Payload hides `.tooltip` below 1024px (its `mid-break`); that default is left
 * intact, so the tooltip only shows on wider screens. Used for the sidebar's
 * stage icons, count pills and add-child + buttons.
 */
export function HoverTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)

  const open = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setAnchor({ left: r.left + r.width / 2, top: r.top })
  }
  const close = () => setAnchor(null)

  return (
    <span
      ref={ref}
      onBlur={close}
      onFocus={open}
      onMouseEnter={open}
      onMouseLeave={close}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      {children}
      {anchor && typeof document !== 'undefined'
        ? createPortal(
            <span style={{ position: 'fixed', left: anchor.left, top: anchor.top, zIndex: 9999 }}>
              <Tooltip alignCaret="center" delay={0} position="top" show>
                {text}
              </Tooltip>
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
