import type { CSSProperties, ReactNode } from 'react'

import { Hr, Link, Section, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, EmailLayout, styles } from './EmailLayout'

/** Escalation level → email copy. Mirrors the job's reminder stages. */
export type ReminderLevel = 'due' | 'escalated' | 'expired'

/** Key event facts shown in the email so the manager can verify at a glance. */
export interface EventDetails {
  title: string
  /** `Address` (offline) or `Online`. */
  locationLabel: string
  /** One-line address, or the online URL. */
  location: string
  /** One-line schedule summary. */
  schedule: string
  /** Contact name · phone, when set. */
  contact?: string
  /** Formatted scheduled-break lines, when any. */
  breaks?: string[]
  /** Registrations in the last 30 days — omitted when there are none. */
  recentRegistrations?: number
}

interface EventVerificationReminderEmailProps {
  /** Recipient display name. */
  name: string
  /** The event's title. */
  eventTitle: string
  /** Absolute, tokenized verify link (works logged-out). */
  verifyUrl: string
  /** Escalation level — selects the copy. */
  level: ReminderLevel
  /** Key event facts (rendered as a summary table). */
  details?: EventDetails
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

/** Prominent banner for the escalation + unpublished states (none for `due`). */
const ALERTS: Partial<Record<ReminderLevel, { text: string; bg: string; border: string }>> = {
  escalated: {
    text: '⚠️ Final reminder — if this event isn’t verified, it will be unpublished and hidden from the public.',
    bg: '#fff4e5',
    border: '#f59e0b',
  },
  expired: {
    text: '🚫 This event is currently unpublished and hidden from the public until it’s verified.',
    bg: '#fdecea',
    border: '#ef4444',
  },
}

const detailsTable: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  margin: '8px 0 4px',
  fontSize: '14px',
}
const labelCell: CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  verticalAlign: 'top',
  color: '#6b7280',
  fontWeight: 600,
  width: '38%',
  borderBottom: '1px solid #eef0f2',
}
const valueCell: CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  verticalAlign: 'top',
  color: '#1f2937',
  borderBottom: '1px solid #eef0f2',
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <td style={labelCell}>{label}</td>
      <td style={valueCell}>{children}</td>
    </tr>
  )
}

/**
 * Event verification reminder — the escalating nudge the ExpireEvents job
 * sends as an event ages `verified → reminded → escalated → expired`. Copy is
 * parametrized by escalation `level`; the `escalated`/`expired` levels show an
 * alert. A summary table lets the manager confirm the key details (location,
 * schedule, contact, breaks, recent registrations) straight from the email,
 * and the CTA is the tokenized verify link. Branded `sahaj-atlas`.
 */
export function EventVerificationReminderEmail({
  name,
  eventTitle,
  verifyUrl,
  level,
  details,
  project = 'sahaj-atlas',
}: EventVerificationReminderEmailProps) {
  const brand = getEmailBrand(project)
  const copy = COPY[level]
  const alert = ALERTS[level]
  const isUrl = details ? /^https?:\/\//.test(details.location) : false

  return (
    <EmailLayout brand={brand} heading={copy.heading} previewText={copy.preview}>
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        Your event <strong>{eventTitle}</strong> {copy.body}
      </Text>

      {alert ? (
        <Section
          style={{
            backgroundColor: alert.bg,
            borderLeft: `4px solid ${alert.border}`,
            borderRadius: '4px',
            padding: '12px 14px',
            margin: '4px 0 16px',
            fontSize: '14px',
            color: '#1f2937',
            lineHeight: 1.5,
          }}
        >
          {alert.text}
        </Section>
      ) : null}

      {details ? (
        <table style={detailsTable}>
          <tbody>
            <DetailRow label="Event">{details.title}</DetailRow>
            {details.location ? (
              <DetailRow label={details.locationLabel}>
                {isUrl ? (
                  <Link
                    href={details.location}
                    style={{ ...styles.link, color: brand.colors.primary }}
                  >
                    {details.location}
                  </Link>
                ) : (
                  details.location
                )}
              </DetailRow>
            ) : null}
            {details.schedule ? <DetailRow label="Schedule">{details.schedule}</DetailRow> : null}
            {details.contact ? <DetailRow label="Contact">{details.contact}</DetailRow> : null}
            {details.breaks && details.breaks.length > 0 ? (
              <DetailRow label="Scheduled breaks">
                {details.breaks.map((line, index) => (
                  <span key={index}>
                    {line}
                    {index < details.breaks!.length - 1 ? <br /> : null}
                  </span>
                ))}
              </DetailRow>
            ) : null}
            {typeof details.recentRegistrations === 'number' ? (
              <DetailRow label="Registrations (last 30 days)">
                {details.recentRegistrations}
              </DetailRow>
            ) : null}
          </tbody>
        </table>
      ) : null}

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
