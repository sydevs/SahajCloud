'use client'

import { Button, toast, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React, { useState } from 'react'

import type { VerificationStage } from '@/lib/eventVerification/stages'

type Severity = 'warning' | 'error' | 'info'

interface NoticeConfig {
  severity: Severity
  /** Banner copy; `dueDate` is the formatted `nextCheckAt` (or null). */
  message: (dueDate: string | null) => string
}

/**
 * Which stages surface a banner. `verified` (and unsaved docs) show nothing.
 * Every banner is actionable — each renders a Verify button.
 */
const NOTICES: Partial<Record<VerificationStage, NoticeConfig>> = {
  reminded: {
    severity: 'warning',
    message: (due) =>
      `This event needs verification${due ? ` by ${due}` : ''} to stay listed publicly.`,
  },
  escalated: {
    severity: 'warning',
    message: (due) =>
      `This event is overdue for verification${due ? ` (due ${due})` : ''}. Region managers have been notified — verify to stop further escalation.`,
  },
  urgent: {
    severity: 'error',
    message: (due) =>
      `Final reminder${due ? ` — verify by ${due}` : ''} before this event is unpublished and hidden from the public.`,
  },
  expired: {
    severity: 'error',
    message: () => 'This event is hidden from the public. Verify it to restore the listing.',
  },
  finished: {
    severity: 'info',
    message: () =>
      'This event’s schedule has ended, so it’s no longer listed. Update the schedule and verify to relist it.',
  },
}

const SEVERITY_COLORS: Record<Severity, { bg: string; border: string }> = {
  warning: { bg: 'var(--theme-warning-100)', border: 'var(--theme-warning-500)' },
  error: { bg: 'var(--theme-error-100)', border: 'var(--theme-error-500)' },
  info: { bg: 'var(--theme-elevation-50)', border: 'var(--theme-elevation-150)' },
}

/** Render `nextCheckAt` as a stable `YYYY-MM-DD` due date. */
function formatDueDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

/**
 * Banner shown above the Event's fields when it's due for / past verification.
 * Reads `verificationStage` + `nextCheckAt` from form state; the Verify button
 * hits the explicit `POST /api/events/:id/verify` endpoint (the same shared
 * verify op the save hook and email link use), then reloads to reflect the
 * fresh cycle (`verified`, re-published, reset log).
 */
const EventVerificationNotice: React.FC = () => {
  const { id } = useDocumentInfo()
  const stage = useFormFields(
    ([fields]) => fields?.verificationStage?.value as VerificationStage | undefined,
  )
  const nextCheckAt = useFormFields(([fields]) => fields?.nextCheckAt?.value as string | undefined)
  const [submitting, setSubmitting] = useState(false)

  const notice = stage ? NOTICES[stage] : undefined
  // No banner for verified events or unsaved (no id) documents.
  if (!id || !notice) return null

  const colors = SEVERITY_COLORS[notice.severity]

  const handleVerify = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/events/${id}/verify`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        toast.success('Event verified.')
        window.location.reload()
      } else {
        toast.error('Could not verify this event. Please try again.')
      }
    } catch {
      toast.error('Could not verify this event. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'calc(var(--base) * 0.75)',
        padding: 'calc(var(--base) * 0.6) calc(var(--base) * 0.8)',
        marginBottom: 'calc(var(--base) * 0.75)',
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 'var(--style-radius-m)',
        color: 'var(--theme-elevation-800)',
        fontSize: 'calc(var(--base-body-size) * 1px)',
      }}
    >
      <span>{notice.message(formatDueDate(nextCheckAt))}</span>
      <div style={{ flexShrink: 0 }}>
        <Button buttonStyle="primary" size="small" onClick={handleVerify} disabled={submitting}>
          {submitting ? 'Verifying…' : 'Verify'}
        </Button>
      </div>
    </div>
  )
}

export default EventVerificationNotice
