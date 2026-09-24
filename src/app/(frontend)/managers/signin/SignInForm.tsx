'use client'

import type { CSSProperties } from 'react'

import { useActionState } from 'react'

import type { EmailBrand } from '@/plugins/email'

import { requestSignInLinkAction } from './actions'
import {
  cardHeading,
  cardLead,
  CardShell,
  OutcomeBody,
  primaryButton,
} from '../../_components/CardShell'


/**
 * The request form, and the card that replaces it once an address is accepted.
 *
 * Submitting is the only thing that sends — opening the page does nothing, so
 * the page costs nothing to crawl or prefetch.
 */
export function SignInForm({ brand, iconSrc }: { brand: EmailBrand; iconSrc: string }) {
  const [outcome, formAction, pending] = useActionState(requestSignInLinkAction, null)

  if (outcome?.tone === 'success') {
    return (
      <CardShell brand={brand} iconSrc={iconSrc}>
        <OutcomeBody tone="success" title={outcome.title} message={outcome.message} />
      </CardShell>
    )
  }

  return (
    <CardShell brand={brand} iconSrc={iconSrc}>
      <h2 style={cardHeading}>Sign in</h2>
      <p style={cardLead}>
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
    </CardShell>
  )
}

const field: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  margin: '0 0 16px',
  padding: '12px 14px',
  borderRadius: 5,
  border: '1px solid #d1d5db',
  fontSize: 15,
}
const error: CSSProperties = { margin: '16px 0 0', color: '#b91c1c', fontSize: 14 }
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
