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
  /** Formatted date the event is unpublished if unverified (final reminder). */
  deadline?: string
  /** Human duration since the event was last verified (expired level). */
  sinceLastVerified?: string
  /** Project to brand for. Defaults to `sahaj-atlas` (events are Atlas). */
  project?: ProjectSlug
}

const COPY: Record<ReminderLevel, { heading: string; preview: string; cta: string }> = {
  due: {
    heading: 'Please verify your event',
    preview: 'A quick check that your event is still running.',
    cta: 'Verify this event',
  },
  escalated: {
    heading: 'Final reminder: verify your event',
    preview: 'Last reminder before your event is unpublished.',
    cta: 'Verify now',
  },
  expired: {
    heading: 'Your event has been unpublished',
    preview: 'Your unverified event is now hidden from the public.',
    cta: 'Verify to restore',
  },
}

/** Body paragraph — briefly explains the verification progression per level. */
function bodyFor(level: ReminderLevel, eventTitle: string, brandName: string): ReactNode {
  const title = <strong>{eventTitle}</strong>
  switch (level) {
    case 'due':
      return (
        <>
          To keep public listings accurate, {brandName} events are re-verified periodically. Please
          confirm {title} is still running. If it isn’t verified you’ll get one final reminder, and
          then it’s unpublished from public listings until verified.
        </>
      )
    case 'escalated':
      return (
        <>
          {title} still needs verification. Earlier reminders went unanswered, so this is the final
          reminder before it’s unpublished and hidden from the public.
        </>
      )
    case 'expired':
      return (
        <>
          {title} wasn’t verified despite earlier reminders, so it’s now unpublished and hidden from
          the public. Verifying it restores the listing right away.
        </>
      )
  }
}

/** The escalated/expired alert banner, parametrised by deadline / duration. */
function alertFor(
  level: ReminderLevel,
  deadline?: string,
  sinceLastVerified?: string,
): { node: ReactNode; bg: string; border: string } | null {
  if (level === 'escalated') {
    return {
      bg: '#fff4e5',
      border: '#f59e0b',
      node: deadline ? (
        <>
          ⚠️ <strong>Final reminder.</strong> If it isn’t verified by <strong>{deadline}</strong>,
          this event will be unpublished and hidden from the public.
        </>
      ) : (
        <>
          ⚠️ <strong>Final reminder.</strong> If it isn’t verified soon, this event will be
          unpublished and hidden from the public.
        </>
      ),
    }
  }
  if (level === 'expired') {
    return {
      bg: '#fdecea',
      border: '#ef4444',
      node: sinceLastVerified ? (
        <>
          🚫 This event hasn’t been verified in <strong>{sinceLastVerified}</strong>, despite
          earlier reminders — so it’s now unpublished and hidden from the public.
        </>
      ) : (
        <>
          🚫 This event hasn’t been verified, despite earlier reminders — so it’s now unpublished
          and hidden from the public.
        </>
      ),
    }
  }
  return null
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
 * Event verification reminder — the escalating nudge the ExpireEvents job sends
 * as an event ages `verified → reminded → escalated → expired`. The body
 * explains the progression; the final reminder shows the unpublish deadline and
 * the expired notice shows how long it's gone unverified (so the outcome reads
 * as fair). A summary table lets the manager confirm the key details straight
 * from the email; the CTA is the tokenized verify link. Branded `sahaj-atlas`.
 */
export function EventVerificationReminderEmail({
  name,
  eventTitle,
  verifyUrl,
  level,
  details,
  deadline,
  sinceLastVerified,
  project = 'sahaj-atlas',
}: EventVerificationReminderEmailProps) {
  const brand = getEmailBrand(project)
  const copy = COPY[level]
  const alert = alertFor(level, deadline, sinceLastVerified)
  const isUrl = details ? /^https?:\/\//.test(details.location) : false

  return (
    <EmailLayout brand={brand} heading={copy.heading} previewText={copy.preview}>
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>{bodyFor(level, eventTitle, brand.productName)}</Text>

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
          {alert.node}
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
        You’re receiving this because you manage this event on {brand.productName}; saving any
        change to it also counts as verifying it. This verify link is unique to you and acts on your
        behalf — please don’t forward this email.
      </Text>
    </EmailLayout>
  )
}
