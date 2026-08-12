import { Section, Text } from 'react-email'

import type { EmailBrand } from '@/plugins/email'

import { BrandButtonRow, DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

export interface SubmissionReviewDetail {
  label: string
  value: string
}

interface EventSubmissionReviewEmailProps {
  brand: EmailBrand
  /** `new-event` — creates a listing on accept; `event-update` — patches one. */
  kind: 'new-event' | 'event-update'
  /** Target event's title, for update proposals. */
  eventTitle?: string | null
  submitterName: string
  /** The submitter's free-text note, verbatim (pre-wrapped). */
  submitterNote?: string | null
  details: SubmissionReviewDetail[]
  /** The SahajCloud review page, action preselected. */
  acceptUrl: string
  rejectUrl: string
}

/**
 * "A community member submitted an event — is it real?" — sent to the nearest
 * region manager (or the system contact) once a submission clears screening.
 * The buttons open the SahajCloud review page with the action preselected; the
 * mutation runs on that page's confirm button, never on this link (mail
 * scanners prefetch URLs).
 */
export function EventSubmissionReviewEmail({
  brand,
  kind,
  eventTitle,
  submitterName,
  submitterNote,
  details,
  acceptUrl,
  rejectUrl,
}: EventSubmissionReviewEmailProps) {
  const heading = kind === 'new-event' ? 'New event submitted for review' : 'Event update proposed'

  return (
    <EmailLayout
      brand={brand}
      heading={heading}
      previewText={
        kind === 'new-event'
          ? `${submitterName} submitted a new event for your region`
          : `${submitterName} proposed changes to ${eventTitle ?? 'an event'}`
      }
    >
      <Text style={styles.paragraph}>
        {kind === 'new-event'
          ? `${submitterName} submitted a new event listing in your region. Please check it isn’t spam and looks plausible — accepting publishes it as an unverified listing (it only becomes verified once a manager adopts it).`
          : `${submitterName} proposed changes to “${eventTitle ?? 'an event'}”. Accepting applies the changes to the listing.`}
      </Text>

      {details.length > 0 && (
        <Section>
          <SectionHeading>Submission</SectionHeading>
          {details.map((detail) => (
            <DetailRow key={detail.label} label={detail.label}>
              {detail.value}
            </DetailRow>
          ))}
        </Section>
      )}

      {submitterNote ? (
        <Section>
          <SectionHeading>Note from the submitter</SectionHeading>
          <Text style={{ ...styles.paragraph, whiteSpace: 'pre-wrap' }}>{submitterNote}</Text>
        </Section>
      ) : null}

      <BrandButtonRow
        brand={brand}
        buttons={[
          { label: 'Review & accept', href: acceptUrl },
          { label: 'Reject', href: rejectUrl, variant: 'secondary' },
        ]}
      />
    </EmailLayout>
  )
}

export default EventSubmissionReviewEmail
