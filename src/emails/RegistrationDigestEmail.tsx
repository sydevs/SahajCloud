import type { CSSProperties } from 'react'

import { Fragment } from 'react'
import { Hr, Link, Section, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { EmailLayout, SectionHeading, styles } from './EmailLayout'

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
 * `EventRegistrationEmail`, reusing the same EmailLayout shell + SectionHeading
 * and the Sahaj Atlas project brand (an internal notice, never client-branded).
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
          <SectionHeading>{group.eventTitle}</SectionHeading>
          <Text style={countLine}>{countLabel(group.registrations.length)}</Text>
          {group.registrations.map((registration, registrationIndex) => (
            <Fragment key={registrationIndex}>
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
            </Fragment>
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
    lines.push('', group.eventTitle, `(${countLabel(group.registrations.length)})`)
    for (const registration of group.registrations) {
      const meta = registration.startDate
        ? `${registration.registrantEmail} · ${registration.startDate}`
        : registration.registrantEmail
      lines.push(`- ${registration.registrantName} — ${meta}`)
    }
    lines.push(`View event: ${group.eventAdminUrl}`)
  }

  return lines.join('\n')
}

const countLine: CSSProperties = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '0 0 12px',
}
const registrantName: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#1f2937',
  margin: '0 0 2px',
}
const registrantMeta: CSSProperties = {
  fontSize: '14px',
  color: '#4b5563',
  margin: '0 0 12px',
}
