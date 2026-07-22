'use client'

import type { CSSProperties } from 'react'

import { useActionState } from 'react'

import type { EmailBrand } from '@/plugins/email'

import { unsubscribeAction } from './actions'
import { CardShell, primaryButton, UnsubscribeCard } from './UnsubscribeCard'

interface UnsubscribeFormProps {
  brand: EmailBrand
  iconSrc: string
  token: string
  /** Localized, pre-interpolated copy for the confirmation step. */
  heading: string
  intro: string
  confirmLabel: string
  workingLabel: string
}

/**
 * Two-step unsubscribe UI. Initially shows a confirmation prompt + an
 * "Unsubscribe" button; submitting runs the {@link unsubscribeAction} Server
 * Action (POST) and swaps in the localized result card. Unsubscribing only
 * happens on this explicit submit — never on page load — so email link-scanners
 * can't auto-unsubscribe.
 */
export function UnsubscribeForm({
  brand,
  iconSrc,
  token,
  heading,
  intro,
  confirmLabel,
  workingLabel,
}: UnsubscribeFormProps) {
  const [outcome, formAction, pending] = useActionState(unsubscribeAction, null)

  if (outcome) {
    return <UnsubscribeCard brand={brand} iconSrc={iconSrc} {...outcome} />
  }

  return (
    <CardShell brand={brand} iconSrc={iconSrc}>
      <h2 style={headingStyle}>{heading}</h2>
      <p style={lead}>{intro}</p>
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" disabled={pending} style={primaryButton(brand)}>
          {pending ? workingLabel : confirmLabel}
        </button>
      </form>
    </CardShell>
  )
}

const headingStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 20,
  color: '#1f2937',
  textAlign: 'center',
}
const lead: CSSProperties = {
  margin: '0 0 20px',
  color: '#555',
  lineHeight: 1.6,
  fontSize: 15,
  textAlign: 'center',
}
