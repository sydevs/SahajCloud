import type { Metadata } from 'next'

import { notFound } from 'next/navigation'
import { getPayload } from 'payload'


import { verifyReviewToken } from '@/collections/EventSubmissions/lifecycle/review'
import { relationId } from '@/lib/utilities/relationId'
import type { EventSubmission } from '@/payload-types'
import { getProjectEmailIcon } from '@/plugins/access'
import { getEmailBrand } from '@/plugins/email'

import config from '@payload-config'

import { ReviewForm } from './ReviewForm'
import { VerificationCard } from '../../events/verify/VerificationCard'

export const metadata: Metadata = {
  title: 'Review submission — Sahaj Atlas',
  // Token-gated, per-recipient page — keep it out of search indexes.
  robots: { index: false, follow: false },
}

const BRAND = 'sahaj-atlas' as const

/**
 * Logged-out submission-review landing page (mirrors `/events/verify`): the
 * signed token in `?token=` is the sole access gate — missing/tampered 404s;
 * expired gets a friendly card; valid shows the submission summary with
 * explicit Accept/Reject buttons (the mutation runs only on that POST, never
 * on this GET — mail scanners prefetch links).
 */
export default async function ReviewSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; action?: string }>
}) {
  const { token = '', action } = await searchParams
  const payload = await getPayload({ config })
  const brand = getEmailBrand(BRAND)
  const iconSrc = getProjectEmailIcon(BRAND)

  const result = verifyReviewToken(token, payload.secret)
  if (result.status === 'invalid') notFound()

  if (result.status === 'expired') {
    return (
      <VerificationCard
        brand={brand}
        iconSrc={iconSrc}
        tone="warning"
        title="This link has expired"
        message="This review link is no longer valid. You can still review the submission from the admin panel."
      />
    )
  }

  const submission = (await payload
    .findByID({
      collection: 'event-submissions',
      id: result.claims.submissionId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)) as EventSubmission | null
  if (!submission) notFound()

  if (submission.status !== 'pending' && submission.status !== 'screening') {
    return (
      <VerificationCard
        brand={brand}
        iconSrc={iconSrc}
        tone="success"
        title="Already handled"
        message={`This submission was already resolved (${submission.status}). Nothing left to do.`}
      />
    )
  }

  const targetEventId = relationId(submission.event)
  let eventTitle: string | null = null
  if (targetEventId != null) {
    const event = await payload
      .findByID({
        collection: 'events',
        id: targetEventId,
        depth: 0,
        select: { title: true },
        overrideAccess: true,
      })
      .catch(() => null)
    eventTitle = typeof event?.title === 'string' ? event.title : null
  }

  const rows: { label: string; value: string }[] = [
    ['Type', submission.eventType ?? null],
    ['City', submission.address?.city ?? null],
    ['Street', submission.address?.street ?? null],
    ['Online URL', submission.onlineUrl ?? null],
    ['Languages', submission.languages?.join(', ') ?? null],
    ['Description', submission.description ?? null],
    ['Note', submission.submitterNote ?? null],
    ['Contact', submission.contactEmail || submission.contactPhone || null],
    ['Submitted by', `${submission.submitterName} <${submission.submitterEmail}>`],
  ]
    .filter((row): row is [string, string] => typeof row[1] === 'string' && row[1].trim() !== '')
    .map(([label, value]) => ({ label, value }))

  return (
    <ReviewForm
      brand={brand}
      iconSrc={iconSrc}
      token={token}
      kind={targetEventId != null ? 'event-update' : 'new-event'}
      eventTitle={eventTitle}
      submitterName={submission.submitterName}
      rows={rows}
      initialAction={action === 'accept' || action === 'reject' ? action : null}
    />
  )
}
