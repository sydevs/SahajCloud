import type { Metadata } from 'next'

import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { serverEnv } from '@/lib/env'
import { readVerifyToken } from '@/lib/eventVerification/token'
import { buildEventEmailDetails } from '@/lib/notifications'
import { getProjectEmailIcon } from '@/plugins/access'
import { getEmailBrand } from '@/plugins/email'

import config from '@payload-config'

import { VerificationCard } from './VerificationCard'
import { VerifyForm } from './VerifyForm'

export const metadata: Metadata = {
  title: 'Verify event — Sahaj Atlas',
  // Token-gated, per-recipient page — keep it out of search indexes.
  robots: { index: false, follow: false },
}

const BRAND = 'sahaj-atlas' as const

/**
 * Logged-out event-verification landing page. The signed token (in `?token=`)
 * is the sole access gate — a missing/tampered token 404s (the route is
 * invisible to anyone without a genuine link); an authentic-but-expired token
 * gets a friendly card. A valid token shows the event summary + a "Verify this
 * event" button (the mutation runs only on that POST, never on this GET).
 */
export default async function VerifyEventPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = '' } = await searchParams
  const payload = await getPayload({ config })
  const brand = getEmailBrand(BRAND)
  const iconSrc = getProjectEmailIcon(BRAND)
  const atlasHome = serverEnv.WEMEDITATE_WEB_URL ? `${serverEnv.WEMEDITATE_WEB_URL}/map` : null

  const result = readVerifyToken(token, payload.secret)

  // Missing / malformed / tampered → the page does not exist.
  if (result.status === 'invalid') notFound()

  if (result.status === 'expired') {
    return (
      <VerificationCard
        brand={brand}
        iconSrc={iconSrc}
        tone="warning"
        title="This link has expired"
        message="This verification link is no longer valid. Please wait for the next reminder email, or sign in to verify the event."
        actions={atlasHome ? [{ label: 'Back to Sahaj Atlas', href: atlasHome }] : []}
      />
    )
  }

  // Valid token — load the event for a review summary before confirming.
  const event = await payload
    .findByID({ collection: 'events', id: result.claims.eventId, overrideAccess: true })
    .catch(() => null)

  // The token is valid but the event is gone (deleted) — nothing to verify.
  if (!event) notFound()

  const eventTitle = typeof event.title === 'string' ? event.title : `Event #${event.id}`
  const details = await buildEventEmailDetails({ payload, event }).catch(() => null)
  // Public map link — present only while the event is published (virtual field).
  const eventUrl = typeof event.webUrl === 'string' ? event.webUrl : null

  return (
    <VerifyForm
      brand={brand}
      iconSrc={iconSrc}
      token={token}
      eventTitle={eventTitle}
      details={details}
      eventUrl={eventUrl}
      atlasHome={atlasHome}
    />
  )
}
