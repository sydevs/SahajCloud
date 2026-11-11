'use client'

import type { FormEvent, ReactNode } from 'react'

import { useRef } from 'react'

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

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ email }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = (await response.json().catch(() => null)) as { token?: string } | null
      if (body?.token) {
        window.location.assign(to)
        return
      }
    } catch {
      // Nothing to show: the picker lists only accounts a click can sign in.
    }
    submitting.current = false
  }

  return <form onSubmit={signIn}>{children}</form>
}
