'use client'

import type { CSSProperties } from 'react'

import { useActionState } from 'react'

import type { EmailBrand } from '@/plugins/email'

import { submitFeedbackAction } from './actions'
import { CardShell, primaryButton, VerificationCard } from '../../events/verify/VerificationCard'

interface FeedbackFormProps {
  brand: EmailBrand
  iconSrc: string
  token: string
  eventTitle: string
  /** Vote preselected by the email button (?vote=…), if any — leads the layout. */
  initialVote: 'confirmed' | 'denied' | null
}

/**
 * Two-step feedback UI (mirrors the verify page): the emailed link opens this
 * question; the vote is recorded only on an explicit button POST, so mail
 * scanners can't auto-vote. Both answers stay available regardless of which
 * email button was clicked.
 */
export function FeedbackForm({
  brand,
  iconSrc,
  token,
  eventTitle,
  initialVote,
}: FeedbackFormProps) {
  const [outcome, formAction, pending] = useActionState(submitFeedbackAction, null)

  if (outcome) {
    return <VerificationCard brand={brand} iconSrc={iconSrc} {...outcome} />
  }

  return (
    <CardShell brand={brand} iconSrc={iconSrc}>
      <h2 style={heading}>Did “{eventTitle}” take place?</h2>
      <p style={lead}>
        This listing hasn’t been verified by a local coordinator yet, so your answer really helps
        other seekers know it’s real.
      </p>

      <form action={formAction} style={buttonRow}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          name="vote"
          value="confirmed"
          disabled={pending}
          style={initialVote === 'denied' ? secondaryButton : primaryButton(brand)}
        >
          {pending ? 'Recording…' : 'Yes, it took place'}
        </button>
        <button
          type="submit"
          name="vote"
          value="denied"
          disabled={pending}
          style={initialVote === 'denied' ? primaryButton(brand) : secondaryButton}
        >
          {pending ? 'Recording…' : 'No — I couldn’t find it'}
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
