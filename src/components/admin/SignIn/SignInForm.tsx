'use client'

import type { SignInNotice } from './notices'
import type { ChangeEvent } from 'react'

import { Banner, Button, TextInput } from '@payloadcms/ui'
import { useActionState, useState } from 'react'

import { requestSignInLinkAction } from './actions'
import { fullWidth, heading, lead, stack } from './styles'

/**
 * The request form, and the message that replaces it once an address is
 * accepted.
 *
 * Submitting is the only thing that sends — opening the page does nothing, so
 * the page costs nothing to crawl or prefetch.
 *
 * @param notice A refused link, stated above the form that replaces it. Cleared
 *   by the first submission: once the reader has asked for a fresh link, the old
 *   one's fate stops being news.
 */
export function SignInForm({ notice = null }: { notice?: SignInNotice | null }) {
  const [outcome, formAction, pending] = useActionState(requestSignInLinkAction, null)
  const [email, setEmail] = useState('')

  if (outcome?.tone === 'success') {
    return (
      <div style={stack}>
        <h2 style={heading}>{outcome.title}</h2>
        <p style={lead}>{outcome.message}</p>
      </div>
    )
  }

  return (
    <form action={formAction} style={stack}>
      {notice && !outcome ? (
        <div style={fullWidth}>
          <Banner type={notice.tone}>
            <strong>{notice.title}</strong> {notice.message}
          </Banner>
        </div>
      ) : null}
      <h2 style={heading}>Sign in</h2>
      <p style={lead}>
        Enter your email address and we will send you a link that signs you in. No password needed.
      </p>
      <TextInput
        htmlAttributes={{ autoComplete: 'email' }}
        label="Email"
        onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
        path="email"
        placeholder="you@example.org"
        required
        showError={outcome?.tone === 'error'}
        style={{ ...fullWidth, marginBottom: 0, textAlign: 'left' }}
        value={email}
      />
      {outcome ? (
        <div style={fullWidth}>
          <Banner type="error">{outcome.message}</Banner>
        </div>
      ) : null}
      <Button buttonStyle="primary" disabled={pending} size="large" type="submit">
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </Button>
    </form>
  )
}
