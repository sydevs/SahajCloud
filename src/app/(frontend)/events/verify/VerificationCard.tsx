import type { CSSProperties, ReactNode } from 'react'

import { CircleCheck, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import Image from 'next/image'

import type { EventDetails } from '@/emails/EventVerificationEmail'
import type { EmailBrand } from '@/plugins/email'

export type VerifyTone = 'success' | 'warning' | 'error'

/** Outcome flavour → emblem icon + accent colour. */
export const TONES: Record<VerifyTone, { Icon: LucideIcon; accent: string }> = {
  success: { Icon: CircleCheck, accent: '#16a34a' },
  warning: { Icon: Clock, accent: '#f59e0b' },
  error: { Icon: TriangleAlert, accent: '#ef4444' },
}

/** A button rendered under the message (`primary` filled, `secondary` outlined). */
export interface PageAction {
  label: string
  href: string
  variant?: 'primary' | 'secondary'
}

/**
 * Branded Sahaj Atlas shell — gradient header + white card body. Shared by the
 * result card and the landing form so both match the reminder email. Neutral
 * (no hooks / server-only deps) so it renders in server and client trees alike.
 *
 * @param iconSrc Relative icon path (a local /public asset) — keeps next/image
 *   free of remote-pattern config.
 */
export function CardShell({
  brand,
  iconSrc,
  children,
}: {
  brand: EmailBrand
  iconSrc: string
  children: ReactNode
}) {
  const { primary, light } = brand.colors
  return (
    <div style={cardWrap}>
      <div style={card}>
        <div
          style={{
            ...header,
            backgroundColor: primary,
            backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${light} 100%)`,
          }}
        >
          <Image src={iconSrc} alt={brand.productName} width={48} height={48} style={icon} />
          <h1 style={headerTitle}>{brand.productName}</h1>
        </div>
        <div style={body}>{children}</div>
      </div>
    </div>
  )
}

/** Row of primary/secondary brand buttons (anchors). */
export function ActionButtons({ brand, actions }: { brand: EmailBrand; actions: PageAction[] }) {
  if (actions.length === 0) return null
  const { primary } = brand.colors
  return (
    <div style={actionRow}>
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          style={action.variant === 'secondary' ? secondaryButton(primary) : primaryButton(brand)}
        >
          {action.label}
        </a>
      ))}
    </div>
  )
}

/**
 * The event's key facts, matching the reminder email's "Event details" table
 * (same fields + order). `details` is the shared `EventDetails` built by
 * `buildEventEmailDetails`, so the page and email never drift.
 *
 * The labels are this page's own: the email resolves its own from the
 * translations global, since it goes out in the manager's language while this
 * page — like the rest of the verify flow — is English.
 */
export function EventSummary({ brand, details }: { brand: EmailBrand; details: EventDetails }) {
  const isUrl = /^https?:\/\//.test(details.location)
  const rows: { label: string; value: ReactNode }[] = [{ label: 'Event', value: details.title }]
  if (details.location) {
    rows.push({
      label: details.isOnline ? 'Online' : 'Address',
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
  rows.push({ label: 'Last verified', value: details.lastVerified ?? 'Never' })

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
  const { Icon, accent } = TONES[tone]
  return (
    <CardShell brand={brand} iconSrc={iconSrc}>
      <div style={emblem}>
        <Icon size={44} color={accent} strokeWidth={1.75} aria-hidden />
      </div>
      <h2 style={{ ...cardTitle, color: accent }}>{title}</h2>
      <p style={cardMessage}>{message}</p>
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

const cardWrap: CSSProperties = { maxWidth: 520, margin: '0 auto', padding: '40px 20px' }
const card: CSSProperties = {
  borderRadius: 8,
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}
const header: CSSProperties = { textAlign: 'center', padding: 30 }
const icon: CSSProperties = {
  display: 'block',
  margin: '0 auto 12px',
  padding: 8,
  borderRadius: '50%',
  backgroundColor: '#ffffff',
  objectFit: 'contain',
}
const headerTitle: CSSProperties = { color: '#ffffff', margin: 0, fontSize: 22 }
const body: CSSProperties = {
  backgroundColor: '#ffffff',
  padding: '36px 30px',
  textAlign: 'center',
}
const emblem: CSSProperties = { fontSize: 44, lineHeight: 1, marginBottom: 12 }
const cardTitle: CSSProperties = { margin: '0 0 12px', fontSize: 20 }
const cardMessage: CSSProperties = { margin: 0, color: '#555', lineHeight: 1.6, fontSize: 15 }
const actionRow: CSSProperties = { marginTop: 24 }

const buttonBase: CSSProperties = {
  display: 'inline-block',
  margin: 6,
  padding: '12px 24px',
  borderRadius: 5,
  fontWeight: 'bold',
  fontSize: 15,
  textDecoration: 'none',
  cursor: 'pointer',
  border: 'none',
}
export function primaryButton(brand: EmailBrand): CSSProperties {
  const { primary, light } = brand.colors
  return {
    ...buttonBase,
    color: '#ffffff',
    backgroundColor: primary,
    backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${light} 100%)`,
  }
}
export function secondaryButton(primary: string): CSSProperties {
  return {
    ...buttonBase,
    color: primary,
    backgroundColor: '#ffffff',
    border: `1px solid ${primary}`,
  }
}
