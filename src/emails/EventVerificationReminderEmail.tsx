import { Hr, Link, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, EmailLayout, styles } from './EmailLayout'

/** Escalation level → email copy. Mirrors the job's reminder stages. */
export type ReminderLevel = 'due' | 'escalated' | 'expired'

interface EventVerificationReminderEmailProps {
  /** Recipient display name. */
  name: string
  /** The event's title. */
  eventTitle: string
  /** Absolute, tokenized verify link (works logged-out). */
  verifyUrl: string
  /** Escalation level — selects the copy. */
  level: ReminderLevel
  /** Project to brand for. Defaults to `sahaj-atlas` (events are Atlas). */
  project?: ProjectSlug
}

const COPY: Record<ReminderLevel, { heading: string; preview: string; body: string; cta: string }> =
  {
    due: {
      heading: 'Please verify your event',
      preview: 'One of your events is due for verification.',
      body: 'is due for verification. Please confirm it’s still running so it stays listed publicly.',
      cta: 'Verify this event',
    },
    escalated: {
      heading: 'Action needed: verify your event',
      preview: 'One of your events is overdue for verification.',
      body: 'is overdue for verification. Please verify it soon — if it isn’t verified it will be unpublished and hidden from the public.',
      cta: 'Verify now',
    },
    expired: {
      heading: 'Your event has been unpublished',
      preview: 'An unverified event has been hidden from the public.',
      body: 'has been unpublished because it wasn’t verified in time, so it’s no longer visible to the public. Verify it now to restore the listing.',
      cta: 'Verify to restore',
    },
  }

/**
 * Event verification reminder — the escalating nudge the ExpireEvents job
 * sends as an event ages `verified → reminded → escalated → expired`. Copy is
 * parametrized by escalation `level`; the CTA is the tokenized verify link.
 * Branded `sahaj-atlas` (the first notification-email consumer of #483's
 * template system).
 */
export function EventVerificationReminderEmail({
  name,
  eventTitle,
  verifyUrl,
  level,
  project = 'sahaj-atlas',
}: EventVerificationReminderEmailProps) {
  const brand = getEmailBrand(project)
  const copy = COPY[level]

  return (
    <EmailLayout brand={brand} heading={copy.heading} previewText={copy.preview}>
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        Your event <strong>{eventTitle}</strong> {copy.body}
      </Text>
      <BrandButton href={verifyUrl} brand={brand}>
        {copy.cta}
      </BrandButton>
      <Text style={styles.hint}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
        <br />
        <Link href={verifyUrl} style={{ ...styles.link, color: brand.colors.primary }}>
          {verifyUrl}
        </Link>
      </Text>
      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        You’re receiving this because you manage this event on {brand.productName}. Saving any
        change to the event also counts as verifying it.
      </Text>
    </EmailLayout>
  )
}
