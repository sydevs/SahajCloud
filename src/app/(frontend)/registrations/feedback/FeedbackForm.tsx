'use client'

import type { FeedbackOutcome } from './actions'
import type { CSSProperties } from 'react'

import { startTransition, useActionState, useEffect, useRef } from 'react'

import type { EmailBrand } from '@/plugins/email'


import { submitFeedbackAction } from './actions'
import {
  CardShell,
  primaryButton,
  TONES,
  VerificationCard,
} from '../../events/verify/VerificationCard'

type Vote = 'confirmed' | 'denied'

interface FeedbackFormProps {
  brand: EmailBrand
  iconSrc: string
  token: string
  eventTitle: string
  /** Vote chosen in the email (`?vote=…`) — submitted on arrival, if present. */
  initialVote: Vote | null
  /** A vote already stored on the registration, from an earlier visit. */
  existingVote: Vote | null
}

const OPPOSITE: Record<Vote, Vote> = { confirmed: 'denied', denied: 'confirmed' }
const ANSWER_LABEL: Record<Vote, string> = {
  confirmed: 'Yes, it took place',
  denied: 'No — I couldn’t find it',
}
const RECORDED_TITLE: Record<Vote, string> = {
  confirmed: 'Thank you!',
  denied: 'Thanks for letting us know',
}
const RECORDED_MESSAGE: Record<Vote, string> = {
  confirmed:
    'Your confirmation helps keep the map accurate — thank you for letting us know the class is real.',
  denied:
    'Thanks for letting us know. If enough attendees report the same, the listing will be taken down.',
}

/**
 * The post-event feedback question, and its answer.
 *
 * **One click, not two.** The emailed buttons already say "Yes, it took place";
 * landing on an identical question and having to say it again reads as though
 * the first click failed. So a `?vote=` arrival submits that answer on mount
 * and goes straight to the confirmation.
 *
 * The vote still travels by POST, never by opening the link: mail scanners and
 * prefetchers issue GETs, and a vote nobody cast corrupts the community verdict
 * this whole feature exists to produce. Auto-submitting from JS keeps it to one
 * click for a real reader while a scanner fetching the URL still records
 * nothing — and `<noscript>` leaves the two buttons for anyone without JS.
 *
 * Every path ends on the same confirmation, which names the recorded answer and
 * offers to flip it. A misclick in an email client is the mistake the old
 * second page was nominally guarding against, and it never really could —
 * it showed the same two buttons with no idea which one had been clicked.
 */
export function FeedbackForm({
  brand,
  iconSrc,
  token,
  eventTitle,
  initialVote,
  existingVote,
}: FeedbackFormProps) {
  const [outcome, formAction, pending] = useActionState<FeedbackOutcome | null, FormData>(
    submitFeedbackAction,
    null,
  )
  const submitted = useRef(false)

  useEffect(() => {
    // Once, on arrival from an email button. The ref (not `outcome`) guards it:
    // after a "change my answer" the outcome is populated again, and keying off
    // that would re-submit the original vote and undo the correction.
    if (!initialVote || submitted.current) return
    submitted.current = true
    const data = new FormData()
    data.set('token', token)
    data.set('vote', initialVote)
    startTransition(() => formAction(data))
  }, [initialVote, token, formAction])

  // A failure (expired link, closed listing) is terminal — no answer to change.
  if (outcome && outcome.tone !== 'success') {
    return <VerificationCard brand={brand} iconSrc={iconSrc} {...outcome} />
  }

  // `outcome` wins over `existingVote`: after a change it holds the new answer.
  const recorded = outcome?.recorded ?? (outcome ? null : existingVote)
  if (recorded) {
    const other = OPPOSITE[recorded]
    const { Icon, accent } = TONES.success
    return (
      <CardShell brand={brand} iconSrc={iconSrc}>
        <div style={emblem}>
          <Icon size={44} color={accent} strokeWidth={1.75} aria-hidden />
        </div>
        <h2 style={{ ...cardTitle, color: accent }}>{RECORDED_TITLE[recorded]}</h2>
        <p style={cardMessage}>{RECORDED_MESSAGE[recorded]}</p>
        <p style={recordedLine}>
          You answered: <strong>{ANSWER_LABEL[recorded]}</strong>
        </p>
        <form action={formAction} style={changeRow}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" name="vote" value={other} disabled={pending} style={linkButton}>
            {pending ? 'Changing…' : `That’s not right — change to “${ANSWER_LABEL[other]}”`}
          </button>
        </form>
      </CardShell>
    )
  }

  // Arriving from an email button: the answer is already on its way, so don't
  // flash the question they just answered.
  if (initialVote) {
    return (
      <CardShell brand={brand} iconSrc={iconSrc}>
        <h2 style={heading}>Recording your answer…</h2>
        <noscript>
          <p style={lead}>Your browser needs JavaScript to record it automatically.</p>
          <Question
            brand={brand}
            token={token}
            eventTitle={eventTitle}
            formAction={formAction}
            pending={false}
          />
        </noscript>
      </CardShell>
    )
  }

  return (
    <CardShell brand={brand} iconSrc={iconSrc}>
      <Question
        brand={brand}
        token={token}
        eventTitle={eventTitle}
        formAction={formAction}
        pending={pending}
      />
    </CardShell>
  )
}

/** The question itself — the in-app entry point, and the no-JS fallback. */
function Question({
  brand,
  token,
  eventTitle,
  formAction,
  pending,
}: {
  brand: EmailBrand
  token: string
  eventTitle: string
  formAction: (formData: FormData) => void
  pending: boolean
}) {
  return (
    <>
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
          style={primaryButton(brand)}
        >
          {pending ? 'Recording…' : ANSWER_LABEL.confirmed}
        </button>
        <button type="submit" name="vote" value="denied" disabled={pending} style={secondaryButton}>
          {pending ? 'Recording…' : ANSWER_LABEL.denied}
        </button>
      </form>
    </>
  )
}

const heading: CSSProperties = { margin: '0 0 12px', fontSize: 20, color: '#1f2937' }
const lead: CSSProperties = { margin: '0 0 20px', color: '#555', lineHeight: 1.6, fontSize: 15 }
const buttonRow: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' }
const emblem: CSSProperties = { marginBottom: 12 }
const cardTitle: CSSProperties = { margin: '0 0 10px', fontSize: 22 }
const cardMessage: CSSProperties = {
  margin: '0 0 16px',
  color: '#555',
  lineHeight: 1.6,
  fontSize: 15,
}
const changeRow: CSSProperties = { display: 'flex', justifyContent: 'center', margin: '4px 0 0' }
const recordedLine: CSSProperties = {
  margin: '0 0 6px',
  color: '#4b5563',
  fontSize: 14,
}
const linkButton: CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'none',
  color: '#6b7280',
  fontSize: 13,
  textDecoration: 'underline',
  cursor: 'pointer',
}
const secondaryButton: CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#374151',
  fontSize: 15,
  cursor: 'pointer',
}
