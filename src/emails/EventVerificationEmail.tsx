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

interface EventVerificationEmailProps {
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

/** Interpolation values available to every `body` below. */
interface CopyVars {
  /** The event title (bold). */
  title: ReactNode
  /** The event manager's name (bold) — for region copy. */
  manager: ReactNode
  /** The product/brand name, e.g. "Sahaj Atlas". */
  brandName: string
  /** The unpublish date (bold), or "shortly" when unknown. */
  deadline: ReactNode
  /** How long the event has gone unverified (expired level). */
  sinceLastVerified?: string
}

interface VariantCopy {
  /** Card heading. */
  heading: string
  /** Inbox preview snippet. */
  preview: string
  /** Verify-button label. */
  cta: string
  /** The main paragraph. */
  body: (vars: CopyVars) => ReactNode
  /** Optional coloured callout banner (urgency cue). */
  callout?: ReactNode
}

/* ───────────────────────────────────────────────────────────────────────────
 * EMAIL COPY — edit everything here.
 *
 * `COPY.variants[audience][level]` holds the entire wording for one variation
 * (heading, inbox preview, button label, body paragraph, and optional callout)
 * in a single block, so a variation can be reworded without hunting through the
 * component. `{values}` in a `body` come from CopyVars above. Shared lines
 * (greeting, footer, button hint) sit at the top.
 * ─────────────────────────────────────────────────────────────────────────── */
const COPY: {
  greeting: (name: string) => ReactNode
  buttonHint: string
  footer: (audience: ReminderAudience, brandName: string) => ReactNode
  variants: Record<ReminderAudience, Record<ReminderLevel, VariantCopy>>
} = {
  greeting: (name) => (
    <>
      Hello <strong>{name}</strong>,
    </>
  ),

  buttonHint: 'If the button doesn’t work, copy and paste this link into your browser:',

  footer: (audience, brandName) => (
    <>
      You’re receiving this because you manage{' '}
      {audience === 'region' ? 'this region' : 'this event'} on {brandName}. This verify link is
      unique to you and acts on your behalf — please don’t forward this email.
    </>
  ),

  variants: {
    manager: {
      due: {
        heading: 'Please verify your Sahaja Yoga class',
        preview: 'A quick check that your class is still running.',
        cta: 'Verify this event',
        body: ({ title, brandName, deadline }) => (
          <>
            To keep public listings accurate, {brandName} events must be re-verified periodically.
            Please confirm {title} is still running and its details are correct. If it isn’t
            verified it will be automatically unpublished on {deadline}.
          </>
        ),
      },
      escalated: {
        heading: 'Your Sahaja Yoga class still needs verification',
        preview: 'Your class is overdue for verification.',
        cta: 'Verify now',
        body: ({ title, deadline }) => (
          <>
            {title} still needs verification, and an earlier reminder went unanswered. It will be
            unpublished on {deadline} if it isn’t verified. Your regional manager has now been
            notified too.
          </>
        ),
      },
      urgent: {
        heading: 'Final reminder: verify your Sahaja Yoga class',
        preview: 'Last reminder before your class is unpublished.',
        cta: 'Verify now',
        body: ({ title, deadline }) => (
          <>
            This is the final reminder for {title}. It will be unpublished on {deadline} if it isn’t
            verified — please verify it now.
          </>
        ),
        callout: <>⚠️ This is the final reminder before the event is unpublished.</>,
      },
      expired: {
        heading: 'Your Sahaja Yoga class has been unpublished',
        preview: 'Your unverified class is now hidden from the public.',
        cta: 'Verify to restore',
        body: ({ title, deadline, sinceLastVerified }) => (
          <>
            {title} wasn’t verified{sinceLastVerified ? ` in over ${sinceLastVerified}` : ''}, so it
            was unpublished on {deadline} and is now hidden from the public. Verifying it restores
            the listing right away.
          </>
        ),
        callout: <>🚫 This event is unpublished and hidden from the public until it’s verified.</>,
      },
    },

    region: {
      due: {
        heading: 'An event in your region needs verification',
        preview: 'An event in your region needs verification.',
        cta: 'Verify this event',
        body: ({ title, manager, deadline }) => (
          <>
            {title} is an event in your region and needs verification. It will be unpublished on{' '}
            {deadline} if it isn’t verified. Could you reach out to {manager} and confirm it’s still
            running?
          </>
        ),
      },
      escalated: {
        heading: 'An event in your region needs verification',
        preview: 'An event in your region is overdue for verification.',
        cta: 'Verify this event',
        body: ({ title, manager, deadline }) => (
          <>
            {title} is an event in your region, and its manager hasn’t responded to a verification
            reminder. It will be unpublished on {deadline} if it isn’t verified. Could you reach out
            to {manager} and confirm it’s still running?
          </>
        ),
      },
      urgent: {
        heading: 'Final notice: an event in your region',
        preview: 'Last notice before an event in your region is unpublished.',
        cta: 'Verify this event',
        body: ({ title, manager, deadline }) => (
          <>
            Final notice: {title}, an event in your region, will be unpublished on {deadline} if it
            isn’t verified. Its manager hasn’t responded to earlier reminders — please get in touch
            with {manager} to check on it.
          </>
        ),
        callout: <>⚠️ This is the final notice before the event is unpublished.</>,
      },
      expired: {
        heading: 'An event in your region was unpublished',
        preview: 'An unverified event in your region is now hidden.',
        cta: 'Verify this event',
        body: ({ title, manager, deadline }) => (
          <>
            {title}, an event in your region, was unpublished on {deadline} after going unverified.
            If it’s still running, please contact {manager} and ask them to verify it.
          </>
        ),
        callout: <>🚫 This event is unpublished and hidden from the public until it’s verified.</>,
      },
    },
  },
}

const CALLOUT_COLORS: Partial<Record<ReminderLevel, { bg: string; border: string }>> = {
  urgent: { bg: '#fff4e5', border: '#f59e0b' },
  expired: { bg: '#fdecea', border: '#ef4444' },
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
 * Event verification email — the escalating nudge the ExpireEvents job sends as
 * an event ages `verified → reminded → escalated → urgent → expired`. All
 * wording lives in `COPY` above; this component only wires the chosen variation
 * to the layout, the summary tables, and the tokenized verify button. Region
 * managers (looped in from `escalated`) get region-framed copy plus the event
 * manager's contacts so they can follow up.
 */
export function EventVerificationEmail({
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
}: EventVerificationEmailProps) {
  const brand = getEmailBrand(project)
  const variant = COPY.variants[audience][level]
  const calloutColor = CALLOUT_COLORS[level]
  const isUrl = details ? /^https?:\/\//.test(details.location) : false
  const vars: CopyVars = {
    title: <strong>{eventTitle}</strong>,
    manager: <strong>{eventManager?.name ?? 'the event manager'}</strong>,
    brandName: brand.productName,
    deadline: deadline ? <strong>{deadline}</strong> : 'shortly',
    sinceLastVerified,
  }

  return (
    <EmailLayout brand={brand} heading={variant.heading} previewText={variant.preview}>
      <Text style={styles.paragraph}>{COPY.greeting(name)}</Text>
      <Text style={styles.paragraph}>{variant.body(vars)}</Text>

      {variant.callout && calloutColor ? (
        <Section
          style={{
            backgroundColor: calloutColor.bg,
            borderLeft: `4px solid ${calloutColor.border}`,
            borderRadius: '4px',
            padding: '12px 14px',
            margin: '4px 0 16px',
            fontSize: '14px',
            color: '#1f2937',
            lineHeight: 1.5,
          }}
        >
          {variant.callout}
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
        {variant.cta}
      </BrandButton>
      <Text style={styles.hint}>
        {COPY.buttonHint}
        <br />
        <Link href={verifyUrl} style={{ ...styles.link, color: brand.colors.primary }}>
          {verifyUrl}
        </Link>
      </Text>
      <Hr style={styles.hr} />
      <Text style={styles.footer}>{COPY.footer(audience, brand.productName)}</Text>
    </EmailLayout>
  )
}
