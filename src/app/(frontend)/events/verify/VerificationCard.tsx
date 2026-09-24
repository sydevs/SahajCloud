import type { CSSProperties, ReactNode } from 'react'

import type { EventDetails } from '@/emails/EventVerificationEmail'
import type { EmailBrand } from '@/plugins/email'

import { ActionButtons, CardShell, OutcomeBody, type PageAction } from '../../_components/CardShell'

export type { PageAction }

/** Every tone this page can conclude with. */
export type VerifyTone = 'success' | 'warning' | 'error'

/**
 * The event's key facts, matching the reminder email's "Event details" table
 * (same fields + order). `details` is the shared `EventDetails` built by
 * `buildEventEmailDetails`, so the page and email never drift.
 */
export function EventSummary({ brand, details }: { brand: EmailBrand; details: EventDetails }) {
  const isUrl = /^https?:\/\//.test(details.location)
  const rows: { label: string; value: ReactNode }[] = [{ label: 'Event', value: details.title }]
  if (details.location) {
    rows.push({
      label: details.locationLabel,
      value: isUrl ? (
        <a href={details.location} style={{ color: brand.colors.primary, wordBreak: 'break-all' }}>
          {details.location}
        </a>
      ) : (
        details.location
      ),
    })
  }
  if (details.schedule) rows.push({ label: 'Schedule', value: details.schedule })
  if (details.breaks && details.breaks.length > 0) {
    rows.push({
      label: 'Scheduled breaks',
      value: details.breaks.map((line, i) => (
        <span key={i}>
          {line}
          {i < details.breaks!.length - 1 ? <br /> : null}
        </span>
      )),
    })
  }
  if (details.contact) rows.push({ label: 'Contact', value: details.contact })
  if (typeof details.recentRegistrations === 'number') {
    rows.push({
      label: 'Registrations',
      value: `${details.recentRegistrations} registration${
        details.recentRegistrations === 1 ? '' : 's'
      } in the last 30 days`,
    })
  }
  rows.push({ label: 'Last verified', value: details.lastVerified })

  return (
    <div style={summaryWrap}>
      <h3 style={summaryHeading}>Event details</h3>
      <dl style={summaryList}>
        {rows.map((row) => (
          <div key={row.label} style={summaryRow}>
            <dt style={summaryLabel}>{row.label}</dt>
            <dd style={summaryValue}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Serializable result of a verify attempt — what the card renders. */
export interface VerifyOutcome {
  tone: VerifyTone
  title: string
  message: string
  actions: PageAction[]
}

export interface VerificationCardProps extends Omit<VerifyOutcome, 'actions'> {
  brand: EmailBrand
  iconSrc: string
  actions?: PageAction[]
}

/**
 * Result card — the React equivalent of the old endpoint's hand-built HTML.
 * All copy is plain text (React escapes it); brand colours come from `brand`.
 */
export function VerificationCard({
  brand,
  iconSrc,
  tone,
  title,
  message,
  actions = [],
}: VerificationCardProps) {
  return (
    <CardShell brand={brand} iconSrc={iconSrc}>
      <OutcomeBody tone={tone} title={title} message={message} />
      <ActionButtons brand={brand} actions={actions} />
    </CardShell>
  )
}

const summaryWrap: CSSProperties = { textAlign: 'left', margin: '0 0 24px' }
const summaryHeading: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const summaryList: CSSProperties = { margin: 0 }
const summaryRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  padding: '8px 0',
  borderBottom: '1px solid #eef0f2',
}
const summaryLabel: CSSProperties = {
  margin: 0,
  width: '38%',
  flexShrink: 0,
  color: '#6b7280',
  fontWeight: 600,
  fontSize: 14,
}
// `flex: 1` makes every value cell the same width (so right edges align);
// `minWidth: 0` + `overflowWrap` let long, low-space values wrap instead of
// overflowing the row (the flex min-content gotcha).
const summaryValue: CSSProperties = {
  margin: 0,
  flex: 1,
  minWidth: 0,
  overflowWrap: 'anywhere',
  color: '#1f2937',
  fontSize: 14,
}
