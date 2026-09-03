'use client'

import type { UIFieldClientComponent } from 'payload'

import { Banner, Button, useDocumentInfo } from '@payloadcms/ui'
import React from 'react'

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string }

const FALLBACK_ERROR = 'Could not send the verification email. Please try again.'

/**
 * "Resend verification email" on an unverified manager's edit view.
 *
 * Rendered only when the document is unverified — `initialData._verified` is
 * Payload's own hidden auth field, and it is the same value the `_verified`
 * column shows in the list view. A verified manager gets nothing at all rather
 * than a disabled control, because there is no action to offer them.
 *
 * The button is the whole feature's surface: #680 chose an admin-triggered
 * resend over a public one, so this is where the capability lives. It posts to
 * `POST /api/managers/:id/resend-verification`, which re-checks that the caller
 * is an admin — this component's visibility is a convenience, never the gate.
 */
export const ResendVerification: UIFieldClientComponent = () => {
  const { id, initialData } = useDocumentInfo()
  const [state, setState] = React.useState<State>({ kind: 'idle' })

  const verified = Boolean((initialData as { _verified?: boolean } | undefined)?._verified)

  if (!id || verified) return null

  const send = async () => {
    setState({ kind: 'sending' })
    try {
      const response = await fetch(`/api/managers/${id}/resend-verification`, {
        method: 'POST',
        credentials: 'include',
      })
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean
        email?: string
        message?: string
        errors?: { message?: string }[]
      } | null

      if (!response.ok || !body?.ok) {
        setState({
          kind: 'error',
          message: body?.message || body?.errors?.[0]?.message || FALLBACK_ERROR,
        })
        return
      }
      setState({ kind: 'sent', email: body.email ?? '' })
    } catch {
      setState({ kind: 'error', message: FALLBACK_ERROR })
    }
  }

  return (
    <div className="field-type ui">
      {state.kind === 'sent' ? (
        <Banner type="success">
          Verification email sent{state.email ? ` to ${state.email}` : ''}. The previous link no
          longer works.
        </Banner>
      ) : (
        <>
          <Button
            buttonStyle="secondary"
            disabled={state.kind === 'sending'}
            onClick={send}
            size="small"
          >
            {state.kind === 'sending' ? 'Sending…' : 'Resend verification email'}
          </Button>
          {state.kind === 'error' && <Banner type="error">{state.message}</Banner>}
        </>
      )}
    </div>
  )
}

export default ResendVerification
