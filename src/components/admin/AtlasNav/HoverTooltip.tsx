import React from 'react'

/**
 * Wraps a trigger with a native `title` tooltip.
 *
 * We previously used Payload's styled `Tooltip`, but it renders inline inside the
 * sidebar's scroll container (`.nav__scroll`, `overflow: auto`) — which clips it
 * — and relied on a JS hover handler. Both made it unreliable here. A native
 * `title` is rendered by the browser at the OS level: never clipped, no JS, and
 * reliable across browsers. Used for the sidebar's stage icons, count pills and
 * add-child + buttons.
 */
export function HoverTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span title={text} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {children}
    </span>
  )
}
