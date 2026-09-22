import type { CSSProperties } from 'react'

import { Fragment } from 'react'
import { Hr, Link, Section, Text } from 'react-email'

import type { EmailBrand } from '@/plugins/email'

import { DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

/**
 * What the sender's client knew about where the message came from.
 *
 * Declared here rather than derived from a column: the five keys travel as
 * `submissionData` pairs on `user-submissions` and are rebuilt for this
 * template by `contextFromSubmissionData`, so this renderer owns the shape.
 */
export interface UserMessageContext {
  path?: string
  hostUrl?: string
  locale?: string
  error?: string
  userAgent?: string
}

/** One label/value row — an answer or a detail. */
export interface UserMessageRow {
  label: string
  value: string
}

/**
 * Assemble the details block from the caller-supplied context.
 *
 * Deliberately generic: the intake is shared by every client app, so a caller
 * sending only a message must not produce a table of empty rows. A row appears
 * only when its value is a non-blank string — which is also why this is a pure
 * function rather than inline JSX conditionals: the omission rule is the
 * contract, and it's unit-tested.
 */
export function buildUserMessageDetails(args: {
  /** Name of the API client service the message came through. */
  clientName: string
  /** When the message was received (ISO 8601). */
  receivedAt: string
  context?: UserMessageContext
}): UserMessageRow[] {
  const { clientName, receivedAt, context } = args

  const rows: [string, string | undefined][] = [
    ['Service', clientName],
    ['Locale', context?.locale],
    ['Path', context?.path],
    ['Host page', context?.hostUrl],
    ['Error', context?.error],
    ['User agent', context?.userAgent],
    ['Received', receivedAt],
  ]

  return rows
    .filter((row): row is [string, string] => typeof row[1] === 'string' && row[1].trim() !== '')
    .map(([label, value]) => ({ label, value }))
}

interface UserMessageEmailProps {
  /**
   * The sender's answers, in the order the form's author asked them — see
   * `buildFormAnswers`. Every value is rendered pre-wrapped as an escaped
   * child, never as an anchor: these are submitter-chosen strings, and four of
   * the context keys beside them are exempt from the URL scan
   * (`URL_EXEMPT_KEYS`).
   */
  answers: UserMessageRow[]
  /** The sender's address, when they supplied one. Also the message's `Reply-To`. */
  senderEmail?: string | null
  /** The caller's label for this channel, e.g. `"Issue report"`. */
  subject: string
  /** Pre-filtered label/value rows — see {@link buildUserMessageDetails}. */
  details: UserMessageRow[]
  /**
   * Resolved brand, passed in rather than looked up here (the
   * `SessionReminderEmail` / `RegistrationDigestEmail` shape). The sender also
   * needs it for the `From` display name, so resolving it once at the send site
   * keeps the header and the body from ever disagreeing.
   */
  brand: EmailBrand
}

/**
 * Admin-facing message sent on a viewer's behalf, delivered by
 * `DeliverSubmissions` once a contact submission passes screening (#632).
 *
 * Informational, not an alert — the same shape as `EventRegistrationEmail`: no
 * callout or deadline, a `DetailRow` fact table, and the shared `EmailLayout`
 * shell. Deliberately free of any per-caller framing (no "report an issue"
 * wording): the caller supplies its own `subject` and context, so WeMeditateWeb
 * can reuse the template unchanged.
 *
 * There is no CTA button — replying to the email *is* the action, and the
 * message's `Reply-To` is already the sender's address.
 */
export function UserMessageEmail({
  answers,
  senderEmail,
  subject,
  details,
  brand,
}: UserMessageEmailProps) {
  return (
    <EmailLayout brand={brand} heading={subject} previewText={previewFrom(answers)}>
      <Text style={styles.paragraph}>
        {senderEmail ? (
          <>
            A message came in from{' '}
            <Link
              href={`mailto:${senderEmail}`}
              style={{ ...styles.link, color: brand.colors.primary }}
            >
              {senderEmail}
            </Link>
            . Reply to this email to answer them directly.
          </>
        ) : (
          'A message came in. The sender left no address, so there is no way to reply.'
        )}
      </Text>

      {answers.length > 0 ? (
        <Section>
          <SectionHeading>Answers</SectionHeading>
          {answers.map((answer) => (
            <Fragment key={answer.label}>
              <Text style={answerQuestion}>{answer.label}</Text>
              <Text style={answerValue}>{answer.value}</Text>
            </Fragment>
          ))}
        </Section>
      ) : null}

      {details.length > 0 ? (
        <Section>
          <SectionHeading>Details</SectionHeading>
          {details.map((detail) => (
            <DetailRow key={detail.label} label={detail.label}>
              {detail.value}
            </DetailRow>
          ))}
        </Section>
      ) : null}

      <Hr style={styles.hr} />
      {/*
        The old footer promised "nothing about this message is stored; this email
        is the only record" — true under #602, and a lie since #632. Messages are
        now kept for screening and triage, and a delivered one is purged on a
        short window rather than never written. Saying so is not bookkeeping
        trivia: it is what the sender was told about their own data.
      */}
      <Text style={styles.footer}>
        Sent via {brand.productName}. A copy is kept in the admin panel for a short period so it can
        be checked and followed up, then deleted.
      </Text>
    </EmailLayout>
  )
}

/**
 * The inbox preview line: the longest answer, not the first.
 *
 * Position is the wrong question — a form's first block is usually its Email
 * field, so `answers[0]` made every preview the sender's own address, which is
 * already the `Reply-To` and already two lines into the body. Length is what
 * separates the prose a manager wants to see from a select or a checkbox.
 */
function previewFrom(answers: UserMessageRow[]): string {
  const longest = answers.reduce<string>(
    (best, answer) => (answer.value.length > best.length ? answer.value : best),
    '',
  )
  return longest.slice(0, 120)
}

// The `EventRegistrationEmail` answer pair, so the two forwarded-answer emails
// read as one shape.
const answerQuestion: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#374151',
  margin: '0 0 2px',
}
const answerValue: CSSProperties = {
  fontSize: '14px',
  color: '#1f2937',
  margin: '0 0 12px',
  whiteSpace: 'pre-wrap',
}
