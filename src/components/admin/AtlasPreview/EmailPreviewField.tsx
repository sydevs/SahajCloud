'use client'

import type { UIFieldClientComponent } from 'payload'

import { Collapsible, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import './EmailPreviewField.scss'

/** How long typing must pause before the sample is re-rendered. */
const SETTLE_MS = 500

/**
 * A rendered sample registration email, under the colours.
 *
 * The branding reaches exactly one thing a visitor receives, and until now a
 * manager could only find out by registering for one of their own classes. It
 * renders through the real template, server-side, so what it shows is what a
 * send produces.
 */
export const EmailPreviewField: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  // Only what the template draws.
  const values = useFormFields(([fields]) => ({
    color1: fields['color1']?.value,
    color2: fields['color2']?.value,
    logo: fields['logo']?.value,
    name: fields['title']?.value,
  }))
  const [html, setHtml] = useState<null | string>(null)
  const body = JSON.stringify(values)

  useEffect(() => {
    if (id == null) return

    // One render per pause in typing, not per keystroke: each is a full
    // server-side template render. The abort is what keeps an older render from
    // landing after a newer one and showing colours nobody is looking at.
    const abort = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/clients/${id}/email-preview`, {
          body,
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: abort.signal,
        })

        setHtml(response.ok ? ((await response.json()) as { html: string }).html : null)
      } catch {
        // An abort is the ordinary path here, and a network failure leaves the
        // last rendering on screen rather than an empty frame.
      }
    }, SETTLE_MS)

    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [body, id])

  if (id == null) return null

  return (
    <div className="field-type email-preview-field">
      <Collapsible header="Preview registration email" initCollapsed>
        {html ? (
          // `sandbox` with nothing enabled: the markup is our own template, but it
          // carries a service's logo and title, and a preview has no reason to run
          // anything or reach anywhere.
          <iframe
            sandbox=""
            srcDoc={html}
            style={{
              background: '#ffffff',
              border: 0,
              display: 'block',
              height: '640px',
              width: '100%',
            }}
            title="Preview registration email"
          />
        ) : (
          <p className="field-description" style={{ padding: 'var(--base)' }}>
            Save this service to see a sample email.
          </p>
        )}
      </Collapsible>
    </div>
  )
}

export default EmailPreviewField
