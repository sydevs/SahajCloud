import type { DigestPeriod } from './RegistrationDigestEmail'
import type { CSSProperties } from 'react'

import { Heading, Hr, Link, Section, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { EmailLayout, styles } from './EmailLayout'

const PERIOD_PHRASE: Record<DigestPeriod, string> = {
  day: 'in the last day',
  week: 'in the last week',
}

/** A sign-up screening refused after the visitor was told it went through. */
export interface RefusedSignup {
  name: string
  email: string
  /** Why screening refused it, in words. */
  reason: string
  /** Absolute admin link to the submission, when it still exists. */
  submissionAdminUrl: string | null
}

/** One class and what the spam check refused for it this period. */
export interface RefusedEventGroup {
  eventTitle: string
  /** Absolute admin link to the class, when it still exists. */
  eventAdminUrl: string | null
  /** Refusals at the form, counted per reason — no visitor details are kept. */
  atRequest: { reason: string; count: number }[]
  /** Refusals at screening, one card each. */
  atScreening: RefusedSignup[]
  /** Screening refusals beyond the ones listed. */
  moreAtScreening: number
}

export interface RefusedRegistrationDigestEmailProps {
  recipientName?: string | null
  period: DigestPeriod
  groups: RefusedEventGroup[]
  /** Every refusal in the period, listed or not. */
  total: number
  /** Absolute admin link to the full list of refusals. */
  listUrl: string
  project?: ProjectSlug
}

function countLabel(n: number): string {
  return `${n} class sign-up${n === 1 ? '' : 's'}`
}

const REQUEST_NOTE =
  'Turned away at the form. The visitor was shown why and could try again; nothing they entered was kept.'
const SCREENING_NOTE =
  'Refused after the visitor was told they were signed up, so they do not know. Contact anyone who looks genuine.'

/**
 * Admin digest of the class sign-ups the spam check refused
 * (sydevs/SahajAtlasWeb#259) — the way a captcha refusing real people, or a
 * screening check binning them, reaches someone who can act on it.
 *
 * Manager-informational, so the project brand and no alert callout: a refusal is
 * the spam check doing its job until a pattern says otherwise, and the counts
 * are what show the pattern.
 */
export function RefusedRegistrationDigestEmail({
  recipientName,
  period,
  groups,
  total,
  listUrl,
  project = 'sahaj-atlas',
}: RefusedRegistrationDigestEmailProps) {
  const brand = getEmailBrand(project)
  const linkStyle = { ...styles.link, color: brand.colors.primary }

  return (
    <EmailLayout
      brand={brand}
      heading="Refused sign-ups"
      previewText={`${countLabel(total)} refused by the spam check`}
    >
      <Text style={styles.paragraph}>
        Hello {recipientName ? <strong>{recipientName}</strong> : 'there'},
      </Text>
      <Text style={styles.paragraph}>
        The spam check refused {countLabel(total)} {PERIOD_PHRASE[period]}.
      </Text>

      {groups.map((group, groupIndex) => (
        <Section key={groupIndex}>
          <Heading as="h3" style={{ ...eventHeading, color: brand.colors.primary }}>
            {group.eventTitle}
          </Heading>

          {group.atRequest.length > 0 && (
            <Section style={card}>
              {group.atRequest.map((line, lineIndex) => (
                <Text key={lineIndex} style={cardLine}>
                  <strong style={strongText}>{line.count}×</strong> {line.reason}
                </Text>
              ))}
              <Text style={note}>{REQUEST_NOTE}</Text>
            </Section>
          )}

          {group.atScreening.map((signup, signupIndex) => (
            <Section key={signupIndex} style={card}>
              <Text style={cardLine}>
                <strong style={strongText}>{signup.name}</strong>
                {signup.email ? (
                  <>
                    {' · '}
                    <Link href={`mailto:${signup.email}`} style={linkStyle}>
                      {signup.email}
                    </Link>
                  </>
                ) : null}
              </Text>
              <Text style={cardLine}>{signup.reason}</Text>
              {signup.submissionAdminUrl ? (
                <Text style={cardLine}>
                  <Link href={signup.submissionAdminUrl} style={linkStyle}>
                    View sign-up
                  </Link>
                </Text>
              ) : null}
            </Section>
          ))}
          {group.moreAtScreening > 0 && (
            <Text style={styles.hint}>…and {group.moreAtScreening} more.</Text>
          )}
          {group.atScreening.length > 0 && <Text style={note}>{SCREENING_NOTE}</Text>}

          {group.eventAdminUrl ? (
            <Text style={styles.hint}>
              <Link href={group.eventAdminUrl} style={{ color: brand.colors.primary }}>
                View class
              </Link>
            </Text>
          ) : null}
        </Section>
      ))}

      <Text style={styles.hint}>
        <Link href={listUrl} style={{ color: brand.colors.primary }}>
          See every refused sign-up
        </Link>
      </Text>

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        You’re receiving this summary because you are an admin on {brand.productName}. Change how
        often in your notification preferences.
      </Text>
    </EmailLayout>
  )
}

/** Plain-text alternative, kept beside the component so the two can't drift. */
export function refusedRegistrationDigestText(props: RefusedRegistrationDigestEmailProps): string {
  const { recipientName, period, groups, total, listUrl } = props

  const lines: string[] = [
    `Hello ${recipientName ?? 'there'},`,
    '',
    `The spam check refused ${countLabel(total)} ${PERIOD_PHRASE[period]}.`,
  ]

  for (const group of groups) {
    lines.push('', group.eventTitle)
    if (group.atRequest.length > 0) {
      for (const line of group.atRequest) lines.push(`- ${line.count}× ${line.reason}`)
      lines.push(`  ${REQUEST_NOTE}`)
    }
    for (const signup of group.atScreening) {
      const who = signup.email ? `${signup.name} — ${signup.email}` : signup.name
      lines.push(`- ${who}: ${signup.reason}`)
      if (signup.submissionAdminUrl) lines.push(`    ${signup.submissionAdminUrl}`)
    }
    if (group.moreAtScreening > 0) lines.push(`- …and ${group.moreAtScreening} more.`)
    if (group.atScreening.length > 0) lines.push(`  ${SCREENING_NOTE}`)
    if (group.eventAdminUrl) lines.push(`View class: ${group.eventAdminUrl}`)
  }

  lines.push('', `See every refused sign-up: ${listUrl}`)
  return lines.join('\n')
}

const eventHeading: CSSProperties = {
  fontSize: '17px',
  margin: '28px 0 12px',
  paddingBottom: '6px',
  borderBottom: '1px solid #e5e7eb',
}
const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '0 0 10px',
}
const cardLine: CSSProperties = {
  fontSize: '14px',
  color: '#6b7280',
  margin: 0,
}
const strongText: CSSProperties = {
  color: '#111827',
}
const note: CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  margin: '8px 0 0',
}
