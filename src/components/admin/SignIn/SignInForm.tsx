'use client'

import type { ChangeEvent } from 'react'

import { Banner, Button, TextInput } from '@payloadcms/ui'
import { useActionState, useState } from 'react'

import { requestSignInLinkAction } from './actions'
import styles from './SignIn.module.css'

/** A refused link, stated above the form that fixes it — see `NOTICES`. */
export type SignInNotice = { tone: 'error' | 'warning'; title: string; message: string }

/**
 * The request form, and the message that replaces it once an address is
 * accepted.
 *
 * Submitting is the only thing that sends — opening the page does nothing, so
 * the page costs nothing to crawl or prefetch.
 *
 * @param notice A refused link, stated above the form. Cleared by the first
 *   submission: once the reader has asked for a fresh link, the old one's fate
 *   stops being news.
 */
export function SignInForm({ notice }: { notice: SignInNotice | null }) {
  const [outcome, formAction, pending] = useActionState(requestSignInLinkAction, null)
  const [email, setEmail] = useState('')

  if (outcome?.tone === 'success') {
    return (
      <div className={styles.stack}>
        <h2>{outcome.title}</h2>
        <p>{outcome.message}</p>
      </div>
    )
  }

  return (
    <form action={formAction} className={styles.stack}>
      {notice && !outcome ? (
        <Banner type={notice.tone}>
          <strong>{notice.title}</strong> {notice.message}
        </Banner>
      ) : null}
      <p>
        Enter your email address and we will send you a link that signs you in.
        <br />
        No password needed.
      </p>
      <TextInput
        htmlAttributes={{ autoComplete: 'email' }}
        label="Email"
        onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
        path="email"
        placeholder="you@example.org"
        required
        showError={outcome?.tone === 'error'}
        value={email}
      />
      {outcome ? <Banner type="error">{outcome.message}</Banner> : null}
      <Button buttonStyle="primary" disabled={pending} size="large" type="submit">
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </Button>
    </form>
  )
}
