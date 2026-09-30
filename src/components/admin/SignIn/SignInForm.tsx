'use client'

import type { SignInNotice } from './notices'
import type { ChangeEvent } from 'react'

import { Banner, Button, TextInput } from '@payloadcms/ui'
import { useActionState, useState } from 'react'

import { requestSignInLinkAction } from './actions'
import styles from './SignIn.module.css'

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
      <div className={styles.stack}>
        <h2 className={styles.heading}>{outcome.title}</h2>
        <p className={styles.lead}>{outcome.message}</p>
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
      <p className={styles.lead}>
        Enter your email address and we will send you a link that signs you in.
        <br />
        No password needed.
      </p>
      <TextInput
        className={styles.field}
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
      <Button
        buttonStyle="primary"
        className={styles.action}
        disabled={pending}
        margin={false}
        size="large"
        type="submit"
      >
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </Button>
    </form>
  )
}
