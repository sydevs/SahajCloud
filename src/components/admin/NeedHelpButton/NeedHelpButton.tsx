'use client'

import { Button } from '@payloadcms/ui'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { CONTACT_EMAIL } from '@/lib/contact'

/**
 * "Need help?" in the admin header, to the right of the locale select: a
 * `mailto:` to the support address.
 *
 * ⚠ Payload's header has no slot there. `admin.components.actions` renders to
 * the left of the localizer, which Payload pins absolutely so its popup escapes
 * the header's clipped row. So this mounts as an action, portals itself into the
 * header beside the localizer, and publishes its width as `--need-help-width`
 * for `custom.scss` to move the localizer and its hidden spacer in by.
 */
export function NeedHelpButton(): React.ReactElement {
  const markerRef = useRef<HTMLSpanElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)
  const [header, setHeader] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setHeader(markerRef.current?.closest<HTMLElement>('.app-header') ?? null)
  }, [])

  // Layout, not passive: the localizer moves before the first paint shows the
  // two overlapping.
  useLayoutEffect(() => {
    const help = helpRef.current
    if (!header || !help) return
    const publish = () => header.style.setProperty('--need-help-width', `${help.offsetWidth}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(help)
    return () => {
      observer.disconnect()
      header.style.removeProperty('--need-help-width')
    }
  }, [header])

  return (
    <>
      <span hidden ref={markerRef} />
      {header
        ? createPortal(
            <div className="need-help" ref={helpRef}>
              <Button
                buttonStyle="secondary"
                el="anchor"
                margin={false}
                size="small"
                url={`mailto:${CONTACT_EMAIL}`}
              >
                Need help?
              </Button>
            </div>,
            header,
          )
        : null}
    </>
  )
}

export default NeedHelpButton
