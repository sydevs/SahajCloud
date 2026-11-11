'use client'

import type { UIFieldClientComponent } from 'payload'

import { FieldLabel, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

/** How long typing must pause before the sample is re-rendered. */
const SETTLE_MS = 500

/**
 * A rendered sample registrant email, beside the logo and support address.
 *
 * The branding reaches exactly one thing a visitor receives, and until now a
 * manager could only find out by registering for one of their own classes. It
 * renders through the real template, server-side, so what it shows is what a
 * send produces.
 */
export const EmailPreviewField: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const values = useFormFields(([fields]) => ({
    color1: fields['color1']?.value,
    color2: fields['color2']?.value,
    logo: fields['logo']?.value,
    name: fields['title']?.value,
    supportEmail: fields['supportEmail']?.value,
  }))
  const [html, setHtml] = useState<null | string>(null)
  const body = JSON.stringify(values)

  useEffect(() => {
    if (id == null) return

    // One render per pause in typing, not per keystroke: each is a full
    // server-side template render.
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/clients/${id}/email-preview`, {
        body,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      setHtml(response.ok ? ((await response.json()) as { html: string }).html : null)
    }, SETTLE_MS)

    return () => clearTimeout(timer)
  }, [body, id])

  if (id == null) return null

  return (
    <div className="field-type">
      <FieldLabel label="Sample registrant email" />
      {html ? (
        // `sandbox` with nothing enabled: the markup is our own template, but it
        // carries a service's logo and title, and a preview has no reason to run
        // anything or reach anywhere.
        <iframe
          sandbox=""
          srcDoc={html}
          style={{
            background: '#ffffff',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 'var(--style-radius-s)',
            height: '420px',
            width: '100%',
          }}
          title="Sample registrant email"
        />
      ) : (
        <p className="field-description">Save this service to see a sample email.</p>
      )}
    </div>
  )
}

export default EmailPreviewField
