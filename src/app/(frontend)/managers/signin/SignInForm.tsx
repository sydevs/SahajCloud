'use client'

import type { SignInNotice } from './notices'
import type { CSSProperties } from 'react'

import { useActionState } from 'react'

import type { EmailBrand } from '@/plugins/email'


import { requestSignInLinkAction } from './actions'
import {
  pageHeading,
  pageLead,
  PublicPage,
  OutcomeBody,
  primaryButton,
  TONES,
} from '../../_components/PublicPage'


/**
 * The request form, and the card that replaces it once an address is accepted.
 *
 * Submitting is the only thing that sends — opening the page does nothing, so
 * the page costs nothing to crawl or prefetch.
 *
 * @param notice A refused link, stated above the form that replaces it. Cleared
 *   by the first submission: once the reader has asked for a fresh link, the old
 *   one's fate stops being news.
 */
export function SignInForm({
  brand,
  iconSrc,
  notice = null,
}: {
  brand: EmailBrand
  iconSrc: string
  notice?: SignInNotice | null
}) {
  const [outcome, formAction, pending] = useActionState(requestSignInLinkAction, null)

  if (outcome?.tone === 'success') {
    return (
      <PublicPage iconSrc={iconSrc} title={brand.productName}>
        <OutcomeBody tone="success" title={outcome.title} message={outcome.message} />
      </PublicPage>
    )
  }

  return (
    <PublicPage iconSrc={iconSrc} title={brand.productName}>
      {notice && !outcome ? (
        <div role="alert" style={{ ...noticeBox, borderColor: TONES[notice.tone].accent }}>
          <strong style={{ color: TONES[notice.tone].accent }}>{notice.title}</strong>
          <span style={noticeMessage}>{notice.message}</span>
        </div>
      ) : null}
      <h2 style={pageHeading}>Sign in</h2>
      <p style={pageLead}>
        Enter your email address and we will send you a link that signs you in. No password needed.
      </p>
      <form action={formAction}>
        <label htmlFor="email" style={srOnly}>
          Email address
        </label>
        <input
          autoComplete="email"
          autoFocus
          id="email"
          name="email"
          placeholder="you@example.org"
          required
          style={field}
          type="email"
        />
        <button disabled={pending} style={primaryButton(brand)} type="submit">
          {pending ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>
      {outcome ? (
        <p role="alert" style={error}>
          {outcome.message}
        </p>
      ) : null}
    </PublicPage>
  )
}

const field: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  margin: '0 0 16px',
  padding: '12px 14px',
  borderRadius: 5,
  border: '1px solid var(--border)',
  backgroundColor: 'var(--field)',
  color: 'var(--text)',
  fontSize: 15,
}
const error: CSSProperties = { margin: '16px 0 0', color: 'var(--tone-error)', fontSize: 14 }
const noticeBox: CSSProperties = {
  boxSizing: 'border-box',
  margin: '0 0 20px',
  padding: '12px 14px',
  border: '1px solid',
  borderRadius: 5,
  fontSize: 14,
  textAlign: 'left',
}
const noticeMessage: CSSProperties = { display: 'block', marginTop: 4, color: 'var(--text-muted)' }
// Visible to a screen reader, absent from the layout — the field's own
// placeholder is not a label.
const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}
