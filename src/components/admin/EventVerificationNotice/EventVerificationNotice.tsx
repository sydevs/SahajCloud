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

import type { StageAttention, VerificationStage } from '@/lib/eventVerification/stages'
import type { Event } from '@/payload-types'

import { stageAttention } from '@/lib/eventVerification/stages'


type Severity = 'warning' | 'error' | 'info'

interface NoticeContext {
  /** Formatted `nextCheckAt` (or null). */
  dueDate: string | null
  /** ` — N attendees confirmed it, M denied it` (or empty when no votes). */
  votes: string
}

/** Renders a stage's banner copy, or `null` for the stages that show none. */
type NoticeMessage = ((ctx: NoticeContext) => string) | null

/**
 * How loudly each attention level is rendered. The stage tables below carry
 * only *copy*; how alarming that copy looks is a property of the stage's
 * declared attention, so a new stage can't drift into the wrong colour.
 * `ok` needs no banner at all.
 */
const SEVERITY_BY_ATTENTION: Record<StageAttention, Severity | null> = {
  ok: null,
  due: 'warning',
  urgent: 'error',
  unpublished: 'error',
  ended: 'info',
}

/**
 * Banner copy per stage — exhaustive over `VerificationStage`, so adding a
 * stage is a type error here until its wording is written (`verified` opts out
 * explicitly with `null` rather than by omission).
 * Every ladder banner tells the manager to **republish** — saving the event
 * runs the verify-on-save hook, which re-opens the verification cycle (and
 * publishing an unpublished/expired event also restores its public listing).
 * The pre-adoption pair (`unverified` / `denied`) instead tells them to
 * **assign a manager** — saves without one deliberately change nothing.
 */
const NOTICES: Record<VerificationStage, NoticeMessage> = {
  verified: null,
  unverified: ({ votes }) =>
    `This listing is unverified — it was submitted or imported and has no manager yet${votes}. Assign a manager and save to adopt it into the verification cycle.`,
  denied: ({ votes }) =>
    `This event was unpublished after attendee feedback${votes}. Assign a manager to adopt it, correct the details, and republish to restore the listing.`,
  reminded: ({ dueDate: due }) =>
    `This event needs verification${due ? ` by ${due}` : ''} to stay listed publicly. Republish it to verify.`,
  escalated: ({ dueDate: due }) =>
    `This event is overdue for verification${due ? ` (due ${due})` : ''}. Region managers have been notified — republish it to verify and stop further escalation.`,
  urgent: ({ dueDate: due }) =>
    `Final reminder${due ? ` — due ${due}` : ''}: republish this event to verify it before it’s unpublished and hidden from the public.`,
  expired: () =>
    'This event is hidden from the public. Republish it to verify and restore the listing.',
  finished: () =>
    'This event’s schedule has ended, so it’s no longer listed on the Atlas map, but old links to the event will continue to work. Update the end date to relist the event on the map.',
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
  // Typed by the field's JSON Schema (see `systemMetaField`), so no runtime
  // shape-check is needed — Payload validates it on the way in.
  const systemMeta = useFormFields(
    ([fields]) => fields?.systemMeta?.value as Event['systemMeta'] | undefined,
  )

  const message = stage ? NOTICES[stage] : null
  const severity = stage ? SEVERITY_BY_ATTENTION[stageAttention(stage)] : null
  // No banner for verified events or unsaved (no id) documents.
  if (!id || !message || !severity) return null

  const { confirmations = 0, denials = 0 } = systemMeta?.communityFeedback ?? {}
  const votes =
    confirmations + denials > 0
      ? ` — ${confirmations} attendee${confirmations === 1 ? '' : 's'} confirmed it, ${denials} denied it`
      : ''

  const Icon = SEVERITY_ICON[severity]

  return (
    <Banner type={SEVERITY_BANNER_TYPE[severity]} icon={<Icon />} alignIcon="left">
      {message({ dueDate: formatDueDate(nextCheckAt), votes })}
    </Banner>
  )
}

export default EventVerificationNotice
