import type { Metadata } from 'next'

import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { verifyFeedbackToken } from '@/lib/registrations/feedbackLinks'
import type { Event, Registration } from '@/payload-types'
import { getProjectEmailIcon } from '@/plugins/access'
import { getEmailBrand } from '@/plugins/email'

import config from '@payload-config'

import { FeedbackForm } from './FeedbackForm'
import { VerificationCard } from '../../events/verify/VerificationCard'

export const metadata: Metadata = {
  title: 'Event feedback — Sahaj Atlas',
  // Token-gated, per-recipient page — keep it out of search indexes.
  robots: { index: false, follow: false },
}

const BRAND = 'sahaj-atlas' as const

/**
 * Logged-out post-event feedback landing page (mirrors `/events/verify`): the
 * signed token in `?token=` is the sole access gate — missing/tampered 404s;
 * expired gets a friendly card; valid shows the confirm/deny question. The
 * vote is written only on the explicit button POST.
 */
export default async function RegistrationFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; vote?: string }>
}) {
  const { token = '', vote } = await searchParams
  const payload = await getPayload({ config })
  const brand = getEmailBrand(BRAND)
  const iconSrc = getProjectEmailIcon(BRAND)

  const result = verifyFeedbackToken(token, payload.secret)
  if (result.status === 'invalid') notFound()

  if (result.status === 'expired') {
    return (
      <VerificationCard
        brand={brand}
        iconSrc={iconSrc}
        tone="warning"
        title="This link has expired"
        message="This feedback link is no longer valid — thank you anyway!"
      />
    )
  }

  const registration = (await payload
    .findByID({
      collection: 'registrations',
      id: result.claims.registrationId,
      depth: 1,
      overrideAccess: true,
    })
    .catch(() => null)) as Registration | null
  if (!registration) notFound()

  if (registration.eventFeedback) {
    return (
      <VerificationCard
        brand={brand}
        iconSrc={iconSrc}
        tone="success"
        title="Already recorded"
        message="You’ve already answered for this event — thank you!"
      />
    )
  }

  const event = registration.event as Event | number
  const eventTitle =
    typeof event === 'object' && typeof event.title === 'string' ? event.title : 'this class'

  if (
    typeof event === 'object' &&
    (event.verificationStage !== 'unverified' || event._status !== 'published')
  ) {
    return (
      <VerificationCard
        brand={brand}
        iconSrc={iconSrc}
        tone="warning"
        title="Feedback closed"
        message="This listing is no longer collecting feedback — it has since been verified by a coordinator or taken down."
      />
    )
  }

  return (
    <FeedbackForm
      brand={brand}
      iconSrc={iconSrc}
      token={token}
      eventTitle={eventTitle}
      initialVote={vote === 'confirmed' || vote === 'denied' ? vote : null}
    />
  )
}
