'use client'

import type { CSSProperties } from 'react'

import { useActionState } from 'react'

import type { EmailBrand } from '@/plugins/email'

import { reviewSubmissionAction } from './actions'
import { CardShell, primaryButton, VerificationCard } from '../../events/verify/VerificationCard'

interface ReviewFormProps {
  brand: EmailBrand
  iconSrc: string
  token: string
  /** `new-event` or `event-update` framing for the lead copy. */
  kind: 'new-event' | 'event-update'
  eventTitle: string | null
  submitterName: string
  /** Label/value rows summarising the submission. */
  rows: { label: string; value: string }[]
  /** Preselected action from the email button (?action=…), if any. */
  initialAction: 'accept' | 'reject' | null
}

/**
 * Two-step review UI (mirrors the event VerifyForm): the emailed link opens
 * this summary; the mutation runs only on an explicit button POST, so mail
 * scanners can't auto-accept. Both actions are always available regardless of
 * which email button was clicked — the preselected one just leads.
 */
export function ReviewForm({
  brand,
  iconSrc,
  token,
  kind,
  eventTitle,
  submitterName,
  rows,
  initialAction,
}: ReviewFormProps) {
  const [outcome, formAction, pending] = useActionState(reviewSubmissionAction, null)

  if (outcome) {
    return <VerificationCard brand={brand} iconSrc={iconSrc} {...outcome} />
  }

  const acceptLabel = kind === 'new-event' ? 'Accept & publish listing' : 'Accept & apply changes'

  return (
    <CardShell brand={brand} iconSrc={iconSrc}>
      <h2 style={heading}>
        {kind === 'new-event' ? 'Review this event submission' : 'Review this update proposal'}
      </h2>
      <p style={lead}>
        {kind === 'new-event' ? (
          <>
            <strong>{submitterName}</strong> submitted a new event. Accepting publishes it as an{' '}
            <strong>unverified</strong> listing — it only becomes verified once a manager adopts it.
          </>
        ) : (
          <>
            <strong>{submitterName}</strong> proposed changes to{' '}
            <strong>{eventTitle ?? 'an event'}</strong>. Accepting applies them to the listing.
          </>
        )}
      </p>

      {rows.length > 0 && (
        <dl style={summaryList}>
          {rows.map((row) => (
            <div key={row.label} style={summaryRow}>
              <dt style={summaryLabel}>{row.label}</dt>
              <dd style={summaryValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <form action={formAction} style={buttonRow}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          name="action"
          value="accept"
          disabled={pending}
          style={primaryButton(brand)}
        >
          {pending ? 'Working…' : acceptLabel}
        </button>
        <button
          type="submit"
          name="action"
          value="reject"
          disabled={pending}
          style={initialAction === 'reject' ? primaryButton(brand) : secondaryButton}
        >
          {pending ? 'Working…' : 'Reject'}
        </button>
      </form>
    </CardShell>
  )
}

const heading: CSSProperties = { margin: '0 0 12px', fontSize: 20, color: '#1f2937' }
const lead: CSSProperties = { margin: '0 0 20px', color: '#555', lineHeight: 1.6, fontSize: 15 }
const buttonRow: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' }
const secondaryButton: CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#374151',
  fontSize: 15,
  cursor: 'pointer',
}
const summaryList: CSSProperties = {
  margin: '0 0 20px',
  padding: '12px 16px',
  background: '#f9fafb',
  borderRadius: 8,
}
const summaryRow: CSSProperties = { display: 'flex', gap: 12, padding: '4px 0' }
const summaryLabel: CSSProperties = { minWidth: 110, color: '#6b7280', fontSize: 14 }
const summaryValue: CSSProperties = { margin: 0, color: '#1f2937', fontSize: 14 }
