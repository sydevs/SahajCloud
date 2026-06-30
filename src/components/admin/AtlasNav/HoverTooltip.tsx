'use client'

import { Tooltip } from '@payloadcms/ui'
import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import styles from './HoverTooltip.module.css'

/**
 * Shows a Payload `Tooltip` on hover/focus of its trigger. Two things stop the
 * plain Payload Tooltip from working in this sidebar, both handled here:
 * - it's rendered through a portal to `document.body` so the nav's scroll
 *   container (`.nav__scroll`, `overflow: auto`) can't clip it; and
 * - Payload hides `.tooltip` below 1024px (its `mid-break`), so the colocated
 *   CSS un-hides the copies we portal out (that's why it never showed in the nav).
 * The trigger's top-centre is captured on hover and the tooltip positioned
 * `fixed` above it. Used for the sidebar's stage icons, count pills and
 * add-child + buttons.
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
            <span
              className={styles.portal}
              style={{ position: 'fixed', left: anchor.left, top: anchor.top, zIndex: 9999 }}
            >
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
