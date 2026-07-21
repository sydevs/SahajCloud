import type { CSSProperties } from 'react'

import { Fragment } from 'react'
import { Heading, Hr, Link, Section, Text } from 'react-email'

import type { RegistrationAnswer } from '@/lib/registrations/questions'
import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { EmailLayout, styles } from './EmailLayout'

/** Which digest cadence produced this email — drives the period phrasing. */
export type DigestPeriod = 'day' | 'week'

const PERIOD_PHRASE: Record<DigestPeriod, string> = {
  day: 'in the last day',
  week: 'in the last week',
}

/** One registrant within an event's group. */
export interface DigestRegistration {
  registrantName: string
  registrantEmail: string
  /** Formatted start date of the session the registrant chose, when supplied. */
  startDate?: string | null
  /** The registrant's answers to the event's registration questions, if any. */
  answers?: RegistrationAnswer[]
}

/** One event and the new registrations it accrued this period. */
export interface DigestEventGroup {
  eventTitle: string
  /** Absolute link to the event in the admin. */
  eventAdminUrl: string
  registrations: DigestRegistration[]
}

export interface RegistrationDigestEmailProps {
  /** Recipient display name (the manager). */
  recipientName?: string | null
  /** The cadence this digest covers. */
  period: DigestPeriod
  /** New registrations, grouped by event — one section each. */
  groups: DigestEventGroup[]
  /** Project to brand for. Defaults to `sahaj-atlas` (events are Atlas). */
  project?: ProjectSlug
}

function countLabel(n: number): string {
  return `${n} registration${n === 1 ? '' : 's'}`
}

function totalRegistrations(groups: DigestEventGroup[]): number {
  return groups.reduce((sum, group) => sum + group.registrations.length, 0)
}

/**
 * Manager-facing digest: the new registrations for the events a manager runs,
 * batched into one email per period and grouped by event (a manager with three
 * events gets one email, not three).
 *
 * Informational, not an alert — the manager-notice counterpart to
 * `EventRegistrationEmail`, reusing the same EmailLayout shell + the Sahaj Atlas
 * project brand (an internal notice, never client-branded). Each registration is
 * its own card — name, contact, chosen session, and their answers to the event's
 * registration questions — so a manager running several busy events can scan them
 * one at a time. There's no per-event count line: the cards are the count.
 */
export function RegistrationDigestEmail({
  recipientName,
  period,
  groups,
  project = 'sahaj-atlas',
}: RegistrationDigestEmailProps) {
  const brand = getEmailBrand(project)
  const total = totalRegistrations(groups)

  return (
    <EmailLayout
      brand={brand}
      heading="Your registration summary"
      previewText={`${countLabel(total)} for events you manage`}
    >
      <Text style={styles.paragraph}>
        Hello {recipientName ? <strong>{recipientName}</strong> : 'there'},
      </Text>
      <Text style={styles.paragraph}>
        {countLabel(total)} came in for events you manage {PERIOD_PHRASE[period]}.
      </Text>

      {groups.map((group, groupIndex) => (
        <Section key={groupIndex}>
          <Heading as="h3" style={{ ...eventHeading, color: brand.colors.primary }}>
            {group.eventTitle}
          </Heading>
          {group.registrations.map((registration, registrationIndex) => (
            <Section key={registrationIndex} style={registrationCard}>
              <Text style={registrantName}>{registration.registrantName}</Text>
              <Text style={registrantMeta}>
                <Link
                  href={`mailto:${registration.registrantEmail}`}
                  style={{ ...styles.link, color: brand.colors.primary }}
                >
                  {registration.registrantEmail}
                </Link>
                {registration.startDate ? ` · ${registration.startDate}` : ''}
              </Text>
              {registration.answers?.map((answer, answerIndex) => (
                <Fragment key={answerIndex}>
                  <Text style={answerQuestion}>{answer.label}</Text>
                  <Text style={answerValue}>{answer.value}</Text>
                </Fragment>
              ))}
            </Section>
          ))}
          <Text style={styles.hint}>
            <Link href={group.eventAdminUrl} style={{ color: brand.colors.primary }}>
              View event
            </Link>
          </Text>
        </Section>
      ))}

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        You’re receiving this summary because you manage these events on {brand.productName}.
      </Text>
    </EmailLayout>
  )
}

/**
 * Plain-text alternative. Kept beside the component so the two can't drift, and
 * sent alongside the HTML for deliverability + text-only clients.
 */
export function registrationDigestText(props: RegistrationDigestEmailProps): string {
  const { recipientName, period, groups } = props
  const total = totalRegistrations(groups)

  const lines: string[] = [
    `Hello ${recipientName ?? 'there'},`,
    '',
    `${countLabel(total)} came in for events you manage ${PERIOD_PHRASE[period]}.`,
  ]

  for (const group of groups) {
    lines.push('', group.eventTitle)
    for (const registration of group.registrations) {
      const meta = registration.startDate
        ? `${registration.registrantEmail} · ${registration.startDate}`
        : registration.registrantEmail
      lines.push(`- ${registration.registrantName} — ${meta}`)
      for (const answer of registration.answers ?? []) {
        lines.push(`    ${answer.label}: ${answer.value}`)
      }
    }
    lines.push(`View event: ${group.eventAdminUrl}`)
  }

  return lines.join('\n')
}

// A branded, ruled section header per event — the scan anchor in a busy digest.
const eventHeading: CSSProperties = {
  fontSize: '17px',
  margin: '28px 0 12px',
  paddingBottom: '6px',
  borderBottom: '1px solid #e5e7eb',
}
// Each registration is a white card on the grey body, so they read as distinct rows.
const registrationCard: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '0 0 10px',
}
const registrantName: CSSProperties = {
  fontSize: '15px',
  fontWeight: 700,
  color: '#111827',
  margin: '0 0 2px',
}
const registrantMeta: CSSProperties = {
  fontSize: '13px',
  color: '#6b7280',
  margin: 0,
}
const answerQuestion: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#6b7280',
  margin: '10px 0 1px',
}
const answerValue: CSSProperties = {
  fontSize: '14px',
  color: '#1f2937',
  margin: 0,
  whiteSpace: 'pre-wrap',
}
