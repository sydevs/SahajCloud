'use client'

import type { FormEvent, ReactNode } from 'react'

import { Banner } from '@payloadcms/ui'
import { useRef, useState } from 'react'

/**
 * One preview-picker row: signs in as `email` through `request-magic-link`,
 * which a preview answers with the session cookie, then loads `to`.
 *
 * ⚠ **A full page load, never a client-side navigation.** Payload's auth
 * provider reads the user once, when the admin mounts, so arriving in the panel
 * by a soft navigation from this page leaves it holding no user. Its logout
 * then skips `POST /logout` and lands back here, where the live session cookie
 * signs you straight back in. A Server Action's `redirect()` is exactly that
 * soft navigation.
 */
export function SignInAsForm({
  children,
  email,
  endpoint,
  to,
}: {
  children: ReactNode
  email: string
  endpoint: string
  to: string
}) {
  const submitting = useRef(false)
  const [failed, setFailed] = useState(false)

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setFailed(false)

    const signedIn = await fetch(endpoint, {
      body: JSON.stringify({ email }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { token?: string } | null) => Boolean(body?.token))
      .catch(() => false)

    if (signedIn) {
      window.location.assign(to)
      return
    }
    submitting.current = false
    setFailed(true)
  }

  return (
    <form onSubmit={signIn}>
      {children}
      {failed ? <Banner type="error">Could not sign in as {email}. Try again.</Banner> : null}
    </form>
  )
}
