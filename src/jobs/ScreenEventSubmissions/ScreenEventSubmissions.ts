import type { FlattenedField, Payload, PayloadRequest, TaskConfig } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { formatValue, labelForPath } from '@/collections/EventSubmissions/lifecycle/proposedChanges'
import { buildReviewEmailLink } from '@/collections/EventSubmissions/lifecycle/review'
import {
  emailVerdictNote,
  regionOutcomeNote,
  type ScreeningResult,
} from '@/collections/EventSubmissions/screening'
import { CONTACT_EMAIL } from '@/lib/contact'
import { checkEmailAllowed } from '@/lib/endpoints/antiSpamGuard'
import { findManagerForRegion } from '@/lib/notifications/recipients'
import { sendSubmissionReview } from '@/lib/notifications/sendSubmissionReview'
import { findOrCreateCity } from '@/lib/regions/findOrCreateCity'
import { relationId } from '@/lib/utilities/relationId'
import type { EventSubmission } from '@/payload-types'

import { hasMxRecords } from './emailChecks'

/**
 * Resolve the submission's target region (new-event submissions only):
 * the submitter's anchor wins; else find-or-create the city named in the
 * address under the chosen country/state. Never creates countries, states,
 * or venues — the controlled-rollout policy.
 */
async function resolveSubmissionRegion(
  payload: Payload,
  req: PayloadRequest,
  submission: EventSubmission,
): Promise<{
  regionId: number | null
  outcome: NonNullable<ScreeningResult['region']>
  /** The city screening matched or created — named in the reviewer's note. */
  cityName?: string
  warning?: string
}> {
  const hint = (submission.regionHint ?? {}) as Record<string, unknown>
  const anchorId = relationId(hint.anchorRegion)
  if (anchorId != null) return { regionId: anchorId, outcome: 'anchor' }

  const countryId = relationId(hint.country)
  const proposed = (submission.proposed ?? {}) as Record<string, unknown>
  const address = (proposed.address ?? {}) as Record<string, unknown>
  const cityName = typeof address.city === 'string' ? address.city.trim() : undefined
  if (countryId == null || !cityName) {
    return { regionId: null, outcome: 'unresolved' }
  }

  try {
    const result = await findOrCreateCity({
      payload,
      req,
      cityName,
      countryId,
      stateId: relationId(hint.state),
      latitude: address.latitude as number | undefined,
      longitude: address.longitude as number | undefined,
    })
    if (!result) return { regionId: null, outcome: 'unresolved' }
    return {
      regionId: result.regionId,
      outcome: result.created ? 'created' : 'matched',
      cityName,
      warning: result.warning ?? undefined,
    }
  } catch (error) {
    // Mapbox down or a write conflict — keep the submission reviewable; the
    // manager can set an anchor by hand.
    return {
      regionId: null,
      outcome: 'unresolved',
      warning: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Async screening for a fresh event submission — the deep checks that don't
 * belong in the request path: a disposable-list re-check plus an MX-record
 * lookup on the submitter's email (fail-open on DNS trouble), then region
 * resolution and the review notification.
 *
 * Outcomes:
 * - **spam** — undeliverable/throwaway email: recorded and kept (abuse
 *   tracking), nobody is notified;
 * - **pending** — region resolved (or flagged for triage) and the responsible
 *   manager emailed: an update proposal goes to the target event's manager
 *   (falling back up its region chain for unverified targets); a new event
 *   goes to the nearest manager up the resolved region's chain; the system
 *   contact is the last resort.
 *
 * Queued per-submission by the EventSubmissions afterChange hook; the
 * `screening` queue's 15-minute autoRun retries anything a crash dropped.
 */
export const ScreenEventSubmissions: TaskConfig<'screenEventSubmission'> = {
  slug: 'screenEventSubmission',
  label: 'Screen Event Submission',
  retries: 2,
  inputSchema: [{ name: 'submissionId', type: 'number', required: true }],
  outputSchema: [{ name: 'status', type: 'text', required: true }],
  handler: async ({ input, req }) => {
    const payload = req.payload
    const now = new Date()
    const submissionId = Number(input.submissionId)

    const submission = (await payload.findByID({
      collection: 'event-submissions',
      id: submissionId,
      depth: 0,
      overrideAccess: true,
      req,
    })) as EventSubmission

    // Already screened (a retried job after a mid-run crash, or a manager got
    // there first) — nothing to do.
    if (submission.status !== 'screening') {
      return { output: { status: submission.status } }
    }

    const notes: string[] = []

    // --- Email verdict -----------------------------------------------------
    const listCheck = checkEmailAllowed(submitterEmail(submission))
    let emailVerdict: ScreeningResult['emailVerdict'] = 'ok'
    if (!listCheck.ok) {
      emailVerdict = listCheck.code === 'disposable_email' ? 'disposable_email' : 'invalid_email'
    } else {
      const mx = await hasMxRecords(submitterEmail(submission))
      if (mx === false) emailVerdict = 'no_mx_records'
      if (mx === null) {
        notes.push(
          'The submitter’s email domain couldn’t be checked — the DNS lookup failed, so screening let it through. Worth a second look at the address.',
        )
      }
    }

    if (emailVerdict !== 'ok') {
      await payload.update({
        collection: 'event-submissions',
        id: submissionId,
        data: {
          status: 'spam',
          screeningResult: {
            emailVerdict,
            notes: [emailVerdictNote(emailVerdict), ...notes].filter(
              (note): note is string => note !== null,
            ),
            screenedAt: now.toISOString(),
          } satisfies ScreeningResult,
        },
        overrideAccess: true,
        context: { skipWriteGuard: true },
        req,
      })
      return { output: { status: 'spam' } }
    }

    // --- Region + recipient ------------------------------------------------
    const targetEventId = relationId(submission.event)
    let regionOutcome: ScreeningResult['region']
    let resolvedRegionId: number | null = null
    let recipient: { email: string; name?: string | null; managerId: number | null } | null = null
    let eventTitle: string | null = null

    if (targetEventId != null) {
      // Update proposal: the event's own manager reviews; a managerless
      // (unverified) target escalates up its region chain.
      const event = await payload.findByID({
        collection: 'events',
        id: targetEventId,
        depth: 1,
        select: { title: true, manager: true, region: true },
        overrideAccess: true,
        req,
      })
      eventTitle = typeof event.title === 'string' ? event.title : null
      const manager = typeof event.manager === 'object' ? event.manager : null
      if (manager?.email) {
        recipient = { email: manager.email, name: manager.name, managerId: manager.id }
      } else {
        const regionId = relationId(event.region)
        const regionManager =
          regionId != null ? await findManagerForRegion(payload, regionId, { req }) : null
        if (regionManager?.manager.email) {
          recipient = {
            email: regionManager.manager.email,
            name: regionManager.manager.name,
            managerId: regionManager.manager.id,
          }
        }
      }
    } else {
      const resolution = await resolveSubmissionRegion(payload, req, submission)
      regionOutcome = resolution.outcome
      resolvedRegionId = resolution.regionId
      const regionNote = regionOutcomeNote(resolution.outcome, resolution.cityName)
      if (regionNote) notes.push(regionNote)
      if (resolution.warning) {
        notes.push(`Looking up the address reported: ${resolution.warning}`)
      }

      const hint = (submission.regionHint ?? {}) as Record<string, unknown>
      const chainStartId = resolvedRegionId ?? relationId(hint.state) ?? relationId(hint.country)
      const regionManager =
        chainStartId != null ? await findManagerForRegion(payload, chainStartId, { req }) : null
      if (regionManager?.manager.email) {
        recipient = {
          email: regionManager.manager.email,
          name: regionManager.manager.name,
          managerId: regionManager.manager.id,
        }
      }
    }

    if (!recipient) {
      // Last resort: the system contact reviews it.
      recipient = { email: CONTACT_EMAIL, name: null, managerId: null }
      notes.push(
        'No manager covers this region, so the review request went to the system contact instead.',
      )
      Sentry.captureMessage('ScreenEventSubmissions: no manager to notify', {
        extra: { submissionId },
      })
    }

    // --- Persist BEFORE sending -------------------------------------------
    // The status flip is the exactly-once marker: if the send below fails the
    // task retries from `screening`… so flip status only after a successful
    // send, but stamp region/screening first so a crashed send retains the
    // resolution work.
    await payload.update({
      collection: 'event-submissions',
      id: submissionId,
      data: {
        ...(resolvedRegionId != null ? { region: resolvedRegionId } : {}),
        screeningResult: {
          emailVerdict,
          ...(regionOutcome ? { region: regionOutcome } : {}),
          notes,
          screenedAt: now.toISOString(),
        } satisfies ScreeningResult,
      },
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })

    await sendSubmissionReview({
      payload,
      to: recipient.email,
      recipientName: recipient.name,
      kind: targetEventId != null ? 'event-update' : 'new-event',
      eventTitle,
      submitterName: submitterField(submission, 'name') ?? 'A visitor',
      submitterNote: submitterField(submission, 'note'),
      details: buildDetails(
        submission,
        eventTitle,
        payload.collections?.events?.config?.flattenedFields,
      ),
      reviewUrl: buildReviewEmailLink(submissionId),
    })

    await payload.update({
      collection: 'event-submissions',
      id: submissionId,
      data: { status: 'pending' },
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })

    return { output: { status: 'pending' } }
  },
}

/** Read one string off the submitted `submitterInfo` blob. */
function submitterField(submission: EventSubmission, key: string): string | undefined {
  const info = (submission.submitterInfo ?? {}) as Record<string, unknown>
  const value = info[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** The submitter's email — screened for disposable domains and MX records. */
function submitterEmail(submission: EventSubmission): string {
  return submitterField(submission, 'email') ?? ''
}

/**
 * Summary rows for the review email — every field the submitter proposed,
 * labelled from the Events config.
 *
 * Reuses the admin diff's own formatter and labeller (`proposedChanges.ts`) so
 * the email and the review screen describe a submission the same way, and a new
 * Events field appears in both without either being edited.
 */
function buildDetails(
  submission: EventSubmission,
  eventTitle: string | null,
  eventFields?: FlattenedField[],
): { label: string; value: string }[] {
  const proposed = (submission.proposed ?? {}) as Record<string, unknown>
  const info = (submission.submitterInfo ?? {}) as Record<string, unknown>

  const proposedRows = Object.entries(proposed).map(([key, value]) => ({
    label: labelForPath([key], eventFields),
    value: formatValue(value),
  }))

  return [
    { label: 'Event', value: eventTitle },
    ...proposedRows,
    {
      label: 'Submitted by',
      value: info.name && info.email ? `${String(info.name)} <${String(info.email)}>` : null,
    },
  ].filter((row): row is { label: string; value: string } => {
    return typeof row.value === 'string' && row.value.trim() !== ''
  })
}
