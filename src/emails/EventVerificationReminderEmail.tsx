import type { CSSProperties, ReactNode } from 'react'

import { Column, Heading, Hr, Link, Row, Section, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, EmailLayout, styles } from './EmailLayout'

/** Escalation level → email copy. Mirrors the job's reminder stages. */
export type ReminderLevel = 'due' | 'escalated' | 'urgent' | 'expired'

/** Who the reminder is going to — its manager, or a region manager above it. */
export type ReminderAudience = 'manager' | 'region'

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

/** The event manager's contact card, shown to region managers. */
export interface EventManagerContact {
  name: string
  contacts: { label: string; value: string }[]
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
  /** Whether the recipient is the event manager or a region manager. */
  audience: ReminderAudience
  /** Formatted date the event is / was unpublished. */
  deadline?: string
  /** Human duration the event has gone unverified (expired level). */
  sinceLastVerified?: string
  /** Key event facts (rendered as a summary table). */
  details?: EventDetails
  /** Event manager's contacts — shown to region managers so they can reach out. */
  eventManager?: EventManagerContact
  /** Project to brand for. Defaults to `sahaj-atlas` (events are Atlas). */
  project?: ProjectSlug
}

const HEADINGS: Record<ReminderAudience, Record<ReminderLevel, string>> = {
  manager: {
    due: 'Please verify your Sahaja Yoga class',
    escalated: 'Your Sahaja Yoga class still needs verification',
    urgent: 'Final reminder: verify your Sahaja Yoga class',
    expired: 'Your Sahaja Yoga class has been unpublished',
  },
  region: {
    due: 'An event in your region needs verification',
    escalated: 'An event in your region needs verification',
    urgent: 'Final notice: an event in your region',
    expired: 'An event in your region was unpublished',
  },
}

const PREVIEWS: Record<ReminderLevel, string> = {
  due: 'A quick check that your event is still running.',
  escalated: 'An event is overdue for verification.',
  urgent: 'Last reminder before an event is unpublished.',
  expired: 'An unverified event is now hidden from the public.',
}

const CTAS: Record<ReminderLevel, string> = {
  due: 'Verify this event',
  escalated: 'Verify now',
  urgent: 'Verify now',
  expired: 'Verify to restore',
}

/** When (or whether) verification was missed — "unpublished on X" phrasing. */
function deadlineClause(level: ReminderLevel, deadline?: string): ReactNode {
  if (!deadline) {
    return level === 'expired'
      ? ' and is now hidden from the public'
      : ', or it will be unpublished and hidden from the public'
  }
  return level === 'expired' ? (
    <>
      {' '}
      on <strong>{deadline}</strong>
    </>
  ) : (
    <>
      {' '}
      on <strong>{deadline}</strong> if it isn’t verified
    </>
  )
}

/** Body paragraph for the event manager — explains the progression + deadline. */
function managerBody(
  level: ReminderLevel,
  eventTitle: string,
  brandName: string,
  deadline?: string,
  sinceLastVerified?: string,
): ReactNode {
  const title = <strong>{eventTitle}</strong>
  switch (level) {
    case 'due':
      return (
        <>
          To keep public listings accurate, {brandName} events must be re-verified periodically.
          Please confirm {title} is still running, and the details are correct. If not verified,
          your event will be automatically unpublished on <strong>{deadline}</strong>
        </>
      )
    case 'escalated':
      return (
        <>
          {title} still needs verification, and an earlier reminder went unanswered. It will be
          unpublished{deadlineClause('escalated', deadline)}. Your regional manager has now been
          notified too.
        </>
      )
    case 'urgent':
      return (
        <>
          This is the final reminder for {title}. It will be unpublished
          {deadlineClause('urgent', deadline)} — please verify it now.
        </>
      )
    case 'expired':
      return (
        <>
          {title} wasn’t verified{sinceLastVerified ? ` in over ${sinceLastVerified}` : ''}, so it
          was unpublished{deadlineClause('expired', deadline)} and is now hidden from the public.
          Verifying it restores the listing right away.
        </>
      )
  }
}

/** Body paragraph for a region manager — frames it as an event in their region. */
function regionBody(
  level: ReminderLevel,
  eventTitle: string,
  managerName: string,
  deadline?: string,
): ReactNode {
  const title = <strong>{eventTitle}</strong>
  const manager = <strong>{managerName}</strong>
  switch (level) {
    case 'expired':
      return (
        <>
          {title}, an event in your region, was unpublished{deadlineClause('expired', deadline)}{' '}
          after going unverified. If it’s still running, please contact {manager} and ask them to
          verify it.
        </>
      )
    case 'urgent':
      return (
        <>
          Final notice: {title}, an event in your region, will be unpublished
          {deadlineClause('urgent', deadline)}. Its manager hasn’t responded to earlier reminders —
          please get in touch with {manager} to check on it.
        </>
      )
    default:
      return (
        <>
          {title} is an event in your region, and its manager hasn’t responded to a verification
          reminder. It will be unpublished{deadlineClause('escalated', deadline)}. Could you reach
          out to {manager} and confirm it’s still running?
        </>
      )
  }
}

/** The escalated/expired callout banner (visual urgency; the date is in the body). */
function calloutFor(level: ReminderLevel): { node: ReactNode; bg: string; border: string } | null {
  if (level === 'urgent') {
    return {
      bg: '#fff4e5',
      border: '#f59e0b',
      node: <>⚠️ This is the final reminder before the event is unpublished.</>,
    }
  }
  if (level === 'expired') {
    return {
      bg: '#fdecea',
      border: '#ef4444',
      node: <>🚫 This event is unpublished and hidden from the public until it’s verified.</>,
    }
  }
  return null
}

const sectionHeading: CSSProperties = {
  margin: '18px 0 4px',
  fontSize: '12px',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const labelColumn: CSSProperties = {
  width: '38%',
  padding: '8px 12px',
  verticalAlign: 'top',
  color: '#6b7280',
  fontWeight: 600,
  fontSize: '14px',
  borderBottom: '1px solid #eef0f2',
}
const valueColumn: CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'top',
  color: '#1f2937',
  fontSize: '14px',
  borderBottom: '1px solid #eef0f2',
}

/** A label/value line, built from ReactEmail's Row + Column primitives. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Row>
      <Column style={labelColumn}>{label}</Column>
      <Column style={valueColumn}>{children}</Column>
    </Row>
  )
}

/**
 * Event verification reminder — the escalating nudge the ExpireEvents job sends
 * as an event ages `verified → reminded → escalated → urgent → expired`. The
 * body explains the progression and always states the unpublish date (framed as
 * "was unpublished" once expired). Region managers (looped in from `escalated`)
 * get a different framing — it's an event in their region, not theirs — plus the
 * event manager's contacts and a request to follow up. A summary table lets the
 * recipient confirm the key details; the CTA is the tokenized verify link.
 */
export function EventVerificationReminderEmail({
  name,
  eventTitle,
  verifyUrl,
  level,
  audience,
  deadline,
  sinceLastVerified,
  details,
  eventManager,
  project = 'sahaj-atlas',
}: EventVerificationReminderEmailProps) {
  const brand = getEmailBrand(project)
  const callout = calloutFor(level)
  const isUrl = details ? /^https?:\/\//.test(details.location) : false
  const body =
    audience === 'region'
      ? regionBody(level, eventTitle, eventManager?.name ?? 'the event manager', deadline)
      : managerBody(level, eventTitle, brand.productName, deadline, sinceLastVerified)

  return (
    <EmailLayout brand={brand} heading={HEADINGS[audience][level]} previewText={PREVIEWS[level]}>
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>{body}</Text>

      {callout ? (
        <Section
          style={{
            backgroundColor: callout.bg,
            borderLeft: `4px solid ${callout.border}`,
            borderRadius: '4px',
            padding: '12px 14px',
            margin: '4px 0 16px',
            fontSize: '14px',
            color: '#1f2937',
            lineHeight: 1.5,
          }}
        >
          {callout.node}
        </Section>
      ) : null}

      {audience === 'region' && eventManager ? (
        <Section>
          <Heading as="h3" style={sectionHeading}>
            Event manager
          </Heading>
          <DetailRow label="Name">{eventManager.name}</DetailRow>
          {eventManager.contacts.map((entry) => (
            <DetailRow key={entry.label} label={entry.label}>
              {entry.value}
            </DetailRow>
          ))}
        </Section>
      ) : null}

      {details ? (
        <Section>
          <Heading as="h3" style={sectionHeading}>
            Event details
          </Heading>
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
          {details.contact ? <DetailRow label="Contact">{details.contact}</DetailRow> : null}
          {typeof details.recentRegistrations === 'number' ? (
            <DetailRow label="Registrations">
              {`${details.recentRegistrations} registration${
                details.recentRegistrations === 1 ? '' : 's'
              } in the last 30 days`}
            </DetailRow>
          ) : null}
        </Section>
      ) : null}

      <BrandButton href={verifyUrl} brand={brand}>
        {CTAS[level]}
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
        You’re receiving this because you manage{' '}
        {audience === 'region' ? 'this region' : 'this event'} on {brand.productName}. This verify
        link is unique to you and acts on your behalf — please don’t forward this email.
      </Text>
    </EmailLayout>
  )
}
