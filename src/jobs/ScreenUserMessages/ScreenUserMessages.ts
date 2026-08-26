import type { PayloadRequest, TaskConfig } from 'payload'

import {
  messageVerdictNote,
  type MessageVerdict,
  type UserMessageScreeningResult,
} from '@/collections/UserMessages/screening'
import { SCREENABLE_STATUSES, type MessageStatus } from '@/collections/UserMessages/statuses'
import type { UserMessageContext } from '@/collections/UserMessages/types'
import { checkEmailAllowed } from '@/lib/antiSpam/antiSpamGuard'
import { sendUserMessage } from '@/lib/notifications/sendUserMessage'
import { relationId } from '@/lib/utilities/relationId'
import type { UserMessage } from '@/payload-types'

import { hasMxRecords } from './emailChecks'
import {
  countRecentFromSender,
  countRecentWithBody,
  HISTORY_WINDOW_HOURS,
  REPEAT_SENDER_MAX,
} from './senderHistory'

/** Said in the notification subject when the relaying client can't be resolved. */
const UNKNOWN_CLIENT = 'Unknown service'

/**
 * Async screening for a fresh user message — the deep checks that don't belong
 * in the request path, then delivery.
 *
 * The request path already ran the cheap ones (Turnstile, the disposable-domain
 * list, the URL scan) via the write-guard plugin. This adds what costs real
 * time or a second query:
 *
 * 1. a disposable-list re-check plus an **MX lookup** on the sender's address
 *    (fail-open on DNS trouble);
 * 2. **how many messages this person has sent recently** — bulk mail's shape;
 * 3. **whether this exact body arrived before** — the same, seen from the other
 *    side, and the only check that covers an anonymous message.
 *
 * Outcomes:
 * - **spam** — recorded and kept for abuse tracking, never delivered;
 * - **delivered** — emailed to the contact address, `deliveredAt` stamped;
 * - **failed** — screening passed but the mail transport refused it. The row is
 *   marked before the throw so an admin can see it *now*, and the throw earns a
 *   retry that re-enters here and tries the send again.
 *
 * Queued per-message by the UserMessages afterChange hook; the `screening`
 * queue's 15-minute autoRun (shared with event submissions) retries anything a
 * crash dropped.
 */
export const ScreenUserMessages: TaskConfig<'screenUserMessage'> = {
  slug: 'screenUserMessage',
  label: 'Screen User Message',
  retries: 2,
  inputSchema: [{ name: 'messageId', type: 'number', required: true }],
  outputSchema: [{ name: 'status', type: 'text', required: true }],
  handler: async ({ input, req }) => {
    const payload = req.payload
    const now = new Date()
    const messageId = Number(input.messageId)

    const message = (await payload.findByID({
      collection: 'user-messages',
      id: messageId,
      depth: 0,
      overrideAccess: true,
      req,
    })) as UserMessage

    const status = message.status as MessageStatus
    // Already settled (a retried job after a mid-run crash, or an admin got
    // there first) — nothing to do. `failed` is screenable: that run is only
    // re-attempting the send.
    if (!SCREENABLE_STATUSES.includes(status)) {
      return { output: { status } }
    }

    // A `failed` row has already been screened; recomputing the verdict would
    // re-run a DNS lookup and two counts to reach the same answer, and the
    // second count could even differ (more messages have arrived since), which
    // would let a transport failure turn a clean message into spam on retry.
    let result: UserMessageScreeningResult
    if (status === 'failed' && isScreeningResult(message.screeningResult)) {
      result = message.screeningResult
    } else {
      const verdict = await screen({ req, message, now })
      result = {
        verdict: verdict.verdict,
        notes: [messageVerdictNote(verdict.verdict)].filter(
          (note): note is string => note !== null,
        ),
        ...(verdict.diagnostic ? { diagnostic: verdict.diagnostic } : {}),
        screenedAt: now.toISOString(),
      }

      if (result.verdict !== 'ok') {
        await payload.update({
          collection: 'user-messages',
          id: messageId,
          data: { status: 'spam', screeningResult: result },
          overrideAccess: true,
          context: { skipWriteGuard: true },
          req,
        })
        return { output: { status: 'spam' } }
      }

      // Persist the verdict BEFORE sending. The status flip is the
      // exactly-once marker: if the send below fails the task retries, and
      // stamping the result first means the retry inherits the screening work
      // rather than redoing it. Same ordering as ScreenEventSubmissions.
      await payload.update({
        collection: 'user-messages',
        id: messageId,
        data: { screeningResult: result },
        overrideAccess: true,
        context: { skipWriteGuard: true },
        req,
      })
    }

    try {
      await sendUserMessage({
        payload,
        clientName: await clientNameFor(req, relationId(message.client)),
        message: message.message,
        subject: message.subject || 'Message',
        senderEmail: message.senderEmail ?? undefined,
        context: (message.context ?? undefined) as UserMessageContext | undefined,
        receivedAt: message.createdAt,
      })
    } catch (error) {
      // Mark it failed and then rethrow. The write commits on its own — the job
      // runner hands each task an isolated `transactionID`, so a later throw
      // does not roll it back — which is what makes the row visible as failed
      // immediately while the throw still earns a retry.
      const detail = error instanceof Error ? error.message : String(error)
      payload.logger.error({
        msg: 'ScreenUserMessages: notification email failed to send',
        messageId,
        error: detail,
      })
      await payload.update({
        collection: 'user-messages',
        id: messageId,
        data: {
          status: 'failed',
          screeningResult: { ...result, diagnostic: detail },
        },
        overrideAccess: true,
        context: { skipWriteGuard: true },
        req,
      })
      throw error
    }

    await payload.update({
      collection: 'user-messages',
      id: messageId,
      data: { status: 'delivered', deliveredAt: now.toISOString() },
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })

    return { output: { status: 'delivered' } }
  },
}

/**
 * Run the deep checks in cost order and return the first verdict that hits —
 * the address checks (one DNS lookup at worst) before the history counts (a
 * query each), so an undeliverable address never pays for them.
 */
async function screen(args: {
  req: PayloadRequest
  message: UserMessage
  now: Date
}): Promise<{ verdict: MessageVerdict; diagnostic?: string }> {
  const { req, message, now } = args
  const messageId = message.id
  const senderEmail = message.senderEmail?.trim() ?? ''
  let diagnostic: string | undefined

  /**
   * Every exit goes through here, so the diagnostic rides along wherever it has
   * been set by the time a verdict is reached — rather than each `return`
   * remembering to carry it, which is the shape that quietly drops one.
   */
  const settle = (verdict: MessageVerdict) => ({
    verdict,
    ...(diagnostic ? { diagnostic } : {}),
  })

  // An anonymous message is allowed — `senderEmail` is optional — so absence
  // skips these rather than failing them.
  if (senderEmail) {
    const listCheck = checkEmailAllowed(senderEmail)
    if (!listCheck.ok) {
      return settle(listCheck.code === 'disposable_email' ? 'disposable_email' : 'invalid_email')
    }

    const mx = await hasMxRecords(senderEmail)
    if (mx === false) return settle('no_mx_records')
    // A DNS failure is a fact about our infrastructure, not about the sender,
    // and asks nothing of the admin — so it is kept for triage, not rendered.
    if (mx === null) diagnostic = 'MX lookup inconclusive — passed open.'
  }

  const since = new Date(now.getTime() - HISTORY_WINDOW_HOURS * 60 * 60 * 1000)

  const userId = relationId(message.user)
  if (userId != null) {
    const recent = await countRecentFromSender({ req, messageId, since, userId })
    if (recent > REPEAT_SENDER_MAX) return settle('repeat_sender')
  }

  if (message.bodyHash) {
    const duplicates = await countRecentWithBody({
      req,
      messageId,
      since,
      bodyHash: message.bodyHash,
    })
    if (duplicates > 0) return settle('duplicate_body')
  }

  return settle('ok')
}

/**
 * The relaying service's name, for the notification subject. Read here rather
 * than populated at `depth: 1` so the message read stays a single narrow query
 * — and so a deleted client degrades to a label instead of throwing.
 */
async function clientNameFor(req: PayloadRequest, clientId: number | null): Promise<string> {
  if (clientId == null) return UNKNOWN_CLIENT

  const client = await req.payload.findByID({
    collection: 'clients',
    id: clientId,
    depth: 0,
    select: { name: true },
    overrideAccess: true,
    disableErrors: true,
    req,
  })

  return typeof client?.name === 'string' && client.name.trim() !== ''
    ? client.name
    : UNKNOWN_CLIENT
}

/**
 * The column is JSON, so a bad write could have left anything there. A retry
 * that can't read the stored verdict re-screens rather than trusting it.
 */
function isScreeningResult(value: unknown): value is UserMessageScreeningResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as UserMessageScreeningResult).verdict === 'string'
  )
}
