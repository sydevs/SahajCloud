'use client'

import {
  Banner,
  ErrorIcon,
  InfoIcon,
  useDocumentInfo,
  useFormFields,
  WarningIcon,
} from '@payloadcms/ui'
import React from 'react'

import type { VerificationStage } from '@/lib/eventVerification/stages'

type Severity = 'warning' | 'error' | 'info'

interface NoticeConfig {
  severity: Severity
  /** Banner copy; `dueDate` is the formatted `nextCheckAt` (or null). */
  message: (dueDate: string | null) => string
}

/**
 * Which stages surface a banner. `verified` (and unsaved docs) show nothing.
 * Every banner tells the manager to **republish** — saving the event runs the
 * verify-on-save hook, which re-opens the verification cycle (and publishing an
 * unpublished/expired event also restores its public listing).
 */
const NOTICES: Partial<Record<VerificationStage, NoticeConfig>> = {
  reminded: {
    severity: 'warning',
    message: (due) =>
      `This event needs verification${due ? ` by ${due}` : ''} to stay listed publicly. Republish it to verify.`,
  },
  escalated: {
    severity: 'warning',
    message: (due) =>
      `This event is overdue for verification${due ? ` (due ${due})` : ''}. Region managers have been notified — republish it to verify and stop further escalation.`,
  },
  urgent: {
    severity: 'error',
    message: (due) =>
      `Final reminder${due ? ` — due ${due}` : ''}: republish this event to verify it before it’s unpublished and hidden from the public.`,
  },
  expired: {
    severity: 'error',
    message: () =>
      'This event is hidden from the public. Republish it to verify and restore the listing.',
  },
  finished: {
    severity: 'info',
    message: () =>
      'This event’s schedule has ended, so it’s no longer listed on the Atlas map, but old links to the event will continue to work. Update the end date to relist the event on the map.',
  },
}

// Payload's Banner ships distinct styles only for `default` / `error` /
// `success`. `error` (and `warning`) render red; `info` is neutral `default`.
// The per-severity icon below keeps warning legible from error even though both
// share the red banner — the icons keep their own theme colours (amber vs red).
const SEVERITY_BANNER_TYPE: Record<Severity, 'default' | 'error'> = {
  warning: 'error',
  error: 'error',
  info: 'default',
}

// Payload's own toast icons (SVG, theme-coloured) — no extra icon dependency.
const SEVERITY_ICON: Record<Severity, React.FC> = {
  warning: WarningIcon,
  error: ErrorIcon,
  info: InfoIcon,
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
 * Reads `verificationStage` + `nextCheckAt` from form state and tells the
 * manager to republish — the verify-on-save hook re-verifies on the next save.
 * Purely informational; it carries no action of its own.
 */
const EventVerificationNotice: React.FC = () => {
  const { id } = useDocumentInfo()
  const stage = useFormFields(
    ([fields]) => fields?.verificationStage?.value as VerificationStage | undefined,
  )
  const nextCheckAt = useFormFields(([fields]) => fields?.nextCheckAt?.value as string | undefined)

  const notice = stage ? NOTICES[stage] : undefined
  // No banner for verified events or unsaved (no id) documents.
  if (!id || !notice) return null

  const Icon = SEVERITY_ICON[notice.severity]

  return (
    <Banner type={SEVERITY_BANNER_TYPE[notice.severity]} icon={<Icon />} alignIcon="left">
      {notice.message(formatDueDate(nextCheckAt))}
    </Banner>
  )
}

export default EventVerificationNotice
