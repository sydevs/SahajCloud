'use client'

import type { CSSProperties } from 'react'

import { useActionState } from 'react'

import type { EventDetails } from '@/emails/EventVerificationEmail'
import type { EmailBrand } from '@/plugins/email'

import { verifyEventAction } from './actions'
import {
  ActionButtons,
  PublicPage,
  primaryButton,
  type PageAction,
} from '../../_components/PublicPage'
import { EventSummary, VerificationCard } from '../../_components/VerificationCard'

interface VerifyFormProps {
  brand: EmailBrand
  iconSrc: string
  /** The reminder's page link, which the verify `POST` re-checks. */
  link: string
  /** Where "Update the details" posts: the page link's redeem route. */
  editUrl: string
  eventTitle: string
  details: EventDetails | null
  /** Public map link for the event, or null when unpublished. */
  eventUrl: string | null
  /** `${WEMEDITATE_WEB_URL}/map`, or null when unset. */
  atlasHome: string | null
}

/**
 * The event's summary (the same details as the reminder) and one button that
 * verifies it. Submitting runs {@link verifyEventAction} (a `POST`) and swaps in
 * the result — the only way this page changes anything.
 */
export function VerifyForm({
  brand,
  iconSrc,
  link,
  editUrl,
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
    // Signs them in, so it must be a `POST` — see `PageAction.method`.
    { label: 'Update the details', href: editUrl, variant: 'secondary', method: 'post' },
    ...(eventUrl ? [{ label: 'View event', href: eventUrl, variant: 'secondary' as const }] : []),
    ...(atlasHome
      ? [{ label: 'Back to Sahaj Atlas', href: atlasHome, variant: 'secondary' as const }]
      : []),
  ]

  return (
    <PublicPage iconSrc={iconSrc} title={brand.productName}>
      <h2 style={heading}>Is this event still running?</h2>
      <p style={lead}>
        If the details below for <strong>{eventTitle}</strong> are still right, verify it to keep it
        listed on Sahaj Atlas. If something has changed, update the details instead.
      </p>

      {details && <EventSummary brand={brand} details={details} />}

      <form action={formAction}>
        <input type="hidden" name="link" value={link} />
        <button type="submit" disabled={pending} style={primaryButton(brand)}>
          {pending ? 'Verifying…' : 'Verify this event'}
        </button>
      </form>

      <ActionButtons brand={brand} actions={secondaryActions} />
    </PublicPage>
  )
}

const heading: CSSProperties = { margin: '0 0 12px', fontSize: 20, color: 'var(--text)' }
const lead: CSSProperties = {
  margin: '0 0 20px',
  color: 'var(--text-muted)',
  lineHeight: 1.6,
  fontSize: 15,
}
