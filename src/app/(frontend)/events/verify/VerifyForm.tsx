'use client'

import type { CSSProperties } from 'react'

import { useActionState } from 'react'

import type { EventDetails } from '@/emails/EventVerificationEmail'
import type { EmailBrand } from '@/plugins/email'

import { verifyEventAction } from './actions'
import {
  ActionButtons,
  CardShell,
  EventSummary,
  primaryButton,
  VerificationCard,
  type PageAction,
} from './VerificationCard'

interface VerifyFormProps {
  brand: EmailBrand
  iconSrc: string
  token: string
  eventTitle: string
  details: EventDetails | null
  /** Public map link for the event, or null when unpublished. */
  eventUrl: string | null
  /** `${WEMEDITATE_WEB_URL}/map`, or null when unset. */
  atlasHome: string | null
}

/**
 * Two-step verify UI. Initially shows the full event summary (the same details
 * as the reminder email) + a "Verify this event" button; submitting runs the
 * {@link verifyEventAction} Server Action (POST) and swaps in the result card.
 * Verification only happens on this explicit submit — never on page load — so
 * email link-scanners can't auto-verify.
 */
export function VerifyForm({
  brand,
  iconSrc,
  token,
  eventTitle,
  details,
  eventUrl,
  atlasHome,
}: VerifyFormProps) {
  const [outcome, formAction, pending] = useActionState(verifyEventAction, null)

  if (outcome) {
    return <VerificationCard brand={brand} iconSrc={iconSrc} {...outcome} />
  }

  const secondaryActions: PageAction[] = [
    ...(eventUrl ? [{ label: 'View event', href: eventUrl, variant: 'secondary' as const }] : []),
    ...(atlasHome
      ? [{ label: 'Back to Sahaj Atlas', href: atlasHome, variant: 'secondary' as const }]
      : []),
  ]

  return (
    <CardShell brand={brand} iconSrc={iconSrc}>
      <h2 style={heading}>Is this event still running?</h2>
      <p style={lead}>
        Please confirm the details below for <strong>{eventTitle}</strong> are correct, then verify
        it to keep it listed on Sahaj Atlas.
      </p>

      {details && <EventSummary brand={brand} details={details} />}

      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" disabled={pending} style={primaryButton(brand)}>
          {pending ? 'Verifying…' : 'Verify this event'}
        </button>
      </form>

      <ActionButtons brand={brand} actions={secondaryActions} />
    </CardShell>
  )
}

const heading: CSSProperties = { margin: '0 0 12px', fontSize: 20, color: '#1f2937' }
const lead: CSSProperties = { margin: '0 0 20px', color: '#555', lineHeight: 1.6, fontSize: 15 }
