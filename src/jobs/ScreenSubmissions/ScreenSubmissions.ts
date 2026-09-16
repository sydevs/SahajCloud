import type { SubmissionScreeningResult, SubmissionVerdict } from './verdicts'
import type { PayloadRequest, TaskConfig } from 'payload'

import { runScreeningQueueAfterCommit } from '@/collections/UserSubmissions/screeningQueue'
import { appendLogEntry, asLog } from '@/fields'
import { checkEmailAllowed } from '@/lib/antiSpam/antiSpamGuard'
import { hasMxRecords } from '@/lib/antiSpam/mxRecords'
import type { UserSubmission } from '@/payload-types'

import { screenProposalContent } from './contentScreening'
import {
  hashSubmissionBody,
  HISTORY_WINDOW_HOURS,
  loadSenderHistory,
  REPEAT_SENDER_MAX,
} from './senderHistory'
import { isScreeningResult, VERDICT_NOTES } from './verdicts'

/**
 * Async screening for a fresh submission of any type — the deep checks that do
 * not belong in the request path, then a hand-off to delivery.
 *
 * Replaces `ScreenUserMessages` and `ScreenEventSubmissions`, which duplicated
 * about 38 lines of MX checking between them and could not share a sender's
 * history at all. The request path has already run the cheap checks (Turnstile,
 * the disposable-domain list, the URL scan over `submissionData`) through the
 * write-guard plugin. This adds what costs real time or a second query:
 *
 * 1. a disposable-list re-check plus an **MX lookup** on the sender's address
 *    (fail-open on DNS trouble);
 * 2. **cross-intake sender history** — what this person has had refused lately,
 *    whatever intake they used, which is the whole point of one table;
 * 3. for a proposal alone, **content screening of the proposed patch**, which
 *    no create-time scan reaches.
 *
 * ⚠ **A machine refusal is `spam`, never `rejected`.** `rejected` is a
 * manager's decline, and everything that counts abuse selects `spam` — see
 * `verdicts.ts`. The verdict says which check refused; the status says who did.
 *
 * ⚠ **A refused registration is flagged, never unwound.** It becomes
 * `spam`, which excludes it from reminders and fullness counts
 * (`src/lib/registrations/active.ts`), and nothing else happens: the row
 * stands, any email already sent stands, and no job ever recalls an email. A
 * manager unwinds a real mistake by hand.
 *
 * Known gap, filed separately: the duplicate-body check is scoped to one
 * sender, because the cross-sender version needs a queryable `bodyHash` column
 * that `user-submissions` does not have.
 *
 * Queued per-submission by `enqueueSubmissionScreening`; the `screening`
 * queue's 15-minute autoRun retries anything a crash dropped.
 */
export const ScreenSubmissions: TaskConfig<'screenSubmission'> = {
  slug: 'screenSubmission',
  label: 'Screen Submission',
  retries: 2,
  inputSchema: [{ name: 'submissionId', type: 'number', required: true }],
  outputSchema: [
    { name: 'verdict', type: 'text', required: true },
    { name: 'status', type: 'text', required: true },
  ],
  handler: async ({ input, req }) => {
    const payload = req.payload
    const now = new Date()
    const submissionId = Number(input.submissionId)

    const submission = (await payload.findByID({
      collection: 'user-submissions',
      id: submissionId,
      depth: 0,
      overrideAccess: true,
      req,
    })) as UserSubmission

    // Already settled — a retry after a mid-run crash, or a manager got there
    // first. Screening is idempotent by refusing to run twice rather than by
    // reaching the same answer twice: the history counts move underneath it, so
    // a second run could reach a *different* verdict on the same row.
    if (submission.status !== 'pending' || isScreeningResult(submission.screeningResult)) {
      return {
        output: {
          verdict: isScreeningResult(submission.screeningResult)
            ? submission.screeningResult.verdict
            : 'none',
          status: submission.status,
        },
      }
    }

    const { verdict, diagnostic } = await screen({ req, submission, now })

    const note = VERDICT_NOTES[verdict]
    const result: SubmissionScreeningResult = {
      verdict,
      ...(note ? { notes: [note] } : {}),
      ...(diagnostic ? { diagnostic } : {}),
      screenedAt: now.toISOString(),
    }

    const passed = verdict === 'ok'

    await payload.update({
      collection: 'user-submissions',
      id: submissionId,
      data: {
        screeningResult: result,
        // A pass leaves the row `pending` — delivery is what settles it. Only a
        // refusal is terminal here.
        ...(passed ? {} : { status: 'spam' as const }),
        activityLog: appendLogEntry(asLog(submission.activityLog), {
          at: now.toISOString(),
          type: 'screening',
          key: 'screening',
          verdict,
          cells: {
            activity: passed ? 'Screening passed' : `Screening refused: ${verdict}`,
          },
        }),
      },
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })

    if (!passed) return { output: { verdict, status: 'spam' } }

    // Delivery is a separate task, not the rest of this handler: a transport
    // failure must earn its own retries without re-running the screening work,
    // and the history counts would have moved by the time a retry got here.
    await payload.jobs.queue({
      task: 'deliverSubmission',
      input: { submissionId },
      queue: 'screening',
      req,
    })

    // Deferred for the same reason the create hook defers: this row is queued
    // inside the job's own transaction, so without it delivery waits for the
    // next autoRun. Harmless for the rows this phase serves — it is Phase 3,
    // where a registrant's confirmation moves behind this queue, that would
    // feel a fifteen-minute wait.
    runScreeningQueueAfterCommit({
      payload,
      label: 'ScreenSubmissions',
      context: { submissionId },
    })

    return { output: { verdict, status: 'pending' } }
  },
}

/**
 * Run the checks in cost order and return the first verdict that hits — the
 * address checks (one DNS lookup at worst) before the history read (a query),
 * so an undeliverable address never pays for it.
 */
async function screen(args: {
  req: PayloadRequest
  submission: UserSubmission
  now: Date
}): Promise<{ verdict: SubmissionVerdict; diagnostic?: string }> {
  const { req, submission, now } = args
  const senderEmail = submission.senderEmail?.trim() ?? ''
  let diagnostic: string | undefined

  /**
   * Every exit goes through here, so the diagnostic rides along wherever it has
   * been set by the time a verdict is reached — rather than each `return`
   * remembering to carry it, which is the shape that quietly drops one.
   */
  const settle = (verdict: SubmissionVerdict) => ({
    verdict,
    ...(diagnostic ? { diagnostic } : {}),
  })

  // An anonymous submission is allowed — `senderEmail` is optional — so absence
  // skips these rather than failing them.
  if (senderEmail) {
    const listCheck = checkEmailAllowed(senderEmail)
    if (!listCheck.ok) {
      return settle(listCheck.code === 'disposable_email' ? 'disposable_email' : 'invalid_email')
    }

    const mx = await hasMxRecords(senderEmail)
    if (mx === false) return settle('no_mx_records')
    // A DNS failure is a fact about our infrastructure, not about the sender,
    // and asks nothing of a manager — so it is kept for triage, not rendered.
    if (mx === null) diagnostic = 'MX lookup inconclusive — passed open.'
  }

  if (submission.type === 'proposal') {
    const refusal = screenProposalContent(submission.proposed)
    if (refusal) {
      diagnostic = refusal
      return settle('content_rejected')
    }
  }

  const userId = typeof submission.user === 'number' ? submission.user : (submission.user?.id ?? null)
  if (userId != null) {
    const history = await loadSenderHistory({
      req,
      submissionId: submission.id,
      userId,
      since: new Date(now.getTime() - HISTORY_WINDOW_HOURS * 60 * 60 * 1000),
      bodyHash: hashSubmissionBody(submission.submissionData),
    })

    if (history.spamCount > REPEAT_SENDER_MAX) return settle('repeat_sender')
    if (history.duplicate) return settle('duplicate_body')
  }

  return settle('ok')
}
