'use client'

import { useActionState } from 'react'

import type { EmailBrand } from '@/plugins/email'


import { unsubscribeAction } from './actions'
import { UnsubscribeCard } from './UnsubscribeCard'
import { cardHeading, cardLead, CardShell, primaryButton } from '../../_components/CardShell'

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
      <h2 style={cardHeading}>{heading}</h2>
      <p style={cardLead}>{intro}</p>
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" disabled={pending} style={primaryButton(brand)}>
          {pending ? workingLabel : confirmLabel}
        </button>
      </form>
    </CardShell>
  )
}
