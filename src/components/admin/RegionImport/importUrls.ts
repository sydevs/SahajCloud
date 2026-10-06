/**
 * How the import components reach their endpoints: where each step posts, the one
 * condition under which they refuse to build a URL at all, and the request itself.
 *
 * ⚠ **No locale, no request.** Only the upload is locale-gated —
 * `mayStageImport` reads the grant for `req.locale`, so a manager who
 * coordinates in German holds nothing in English (#701). `useLocale()`'s context
 * default is `{}`, so `code` can be undefined at runtime, and interpolating it
 * yields `?locale=undefined`, which `sanitizeLocales` rewrites to the default
 * locale: the #701 403, reproduced silently. So this answers `null` and the
 * caller reports it, the same rule `SubmissionReview/urls.ts` follows.
 *
 * The later steps re-check the grant in the locale the batch was uploaded in,
 * which the batch stores, and carry the request locale anyway, so the run has
 * one shape and one guard.
 */

import { formatAdminURL } from 'payload/shared'

/** The steps a run walks, in order. */
export type ImportStep = 'upload' | 'resolve' | 'propose' | 'review' | 'tree' | 'choices' | 'commit'

/** What a step that could not be addressed reports, in both components that send one. */
export const NO_LOCALE_REFUSAL =
  'This page could not tell which language you are editing in. Reload it and try again.'

export interface ImportStepUrlArgs {
  /** `config.routes.api`, which is configurable and so never typed in. */
  readonly apiRoute: string
  readonly step: ImportStep
  readonly locale: string | undefined
  /** The staged batch, which every step after the upload addresses. */
  readonly batchId?: null | number
}

/** The URL for one step, or `null` where the run must not send it. */
export function importStepUrl({
  apiRoute,
  batchId,
  locale,
  step,
}: ImportStepUrlArgs): null | string {
  if (!locale) return null
  if (step !== 'upload' && !batchId) return null

  const path: `/${string}` =
    step === 'upload' ? '/event-imports/upload' : `/event-imports/${batchId}/${step}`
  return `${formatAdminURL({ apiRoute, path })}?locale=${encodeURIComponent(locale)}`
}

/**
 * The batch document itself, which the discard writes `deletedAt` to.
 *
 * ⚠ **A discard is an update, not a delete.** `event-imports` is a `trash`
 * collection and `payload.delete` is the hard delete there, kept to the admins
 * and the purge job so a volunteer cannot empty the seven-day window they might
 * need (`EventImports/access.ts`). `deletedAt` is the one column the uploader
 * holds, so `PATCH` is the discard.
 */
export function batchDocumentUrl({
  apiRoute,
  batchId,
  locale,
}: {
  readonly apiRoute: string
  readonly batchId: number
  readonly locale: string | undefined
}): null | string {
  if (!locale) return null
  const path: `/${string}` = `/event-imports/${batchId}`
  return `${formatAdminURL({ apiRoute, path })}?locale=${encodeURIComponent(locale)}`
}

/**
 * What a gateway answers when the app behind it took too long. The request may
 * still be running, so the advice is to wait, not to retry at once.
 */
const GATEWAY_STATUSES = new Set([502, 503, 504, 520, 522, 524])

export const GATEWAY_REFUSAL =
  'The server took too long to answer. It may still be working — wait a minute, then resume.'

/**
 * The message an endpoint refused with, read out of a body that may not be one.
 *
 * Every import endpoint answers `{ errors: [{ message }] }` (`failure`), and so
 * does Payload's own error handler — but a gateway timeout from in front of the
 * app answers HTML, and `response.json()` having thrown is exactly when a caller
 * most needs something to show. With no readable body, a gateway status says
 * the work may still be running, which is the opposite advice from a refusal.
 */
export function refusalMessage(body: unknown, fallback: string, status?: number): string {
  const fromBody = bodyMessage(body)
  if (fromBody) return fromBody
  return status !== undefined && GATEWAY_STATUSES.has(status) ? GATEWAY_REFUSAL : fallback
}

function bodyMessage(body: unknown): null | string {
  if (typeof body !== 'object' || body === null) return null
  const { errors } = body as { errors?: unknown }
  if (!Array.isArray(errors)) return null

  const messages = errors
    .map((error) => (error as { message?: unknown } | null)?.message)
    .filter((message): message is string => typeof message === 'string' && message.length > 0)
  return messages.length ? messages.join(' ') : null
}

export interface ImportResponse {
  body: unknown
  ok: boolean
  status: number
}

/**
 * One request to an import endpoint, and its body whether or not it parsed.
 *
 * ⚠ **`credentials: 'include'`, because every one of these is manager-only.** The
 * endpoints authenticate the admin panel's own cookie, so a request without it is
 * refused as anonymous rather than as unauthorised.
 *
 * ⚠ **A batch another request holds is waited for, not reported.** Every
 * writing endpoint answers 409 `busy` while the batch's lease is held
 * (`EventImports/lease.ts`) — typically the request a dropped connection left
 * running — and it carries on by itself; the lease expires within two minutes
 * however that request ended. So this waits and asks again for longer than
 * that, instead of telling the volunteer something failed.
 */
export async function sendImportRequest(
  url: string,
  method: 'GET' | 'PATCH' | 'POST',
  body?: unknown,
  { busyRetries = BUSY_RETRIES }: { busyRetries?: number } = {},
): Promise<ImportResponse> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    })
    const parsed: unknown = await response.json().catch(() => null)
    const busy = response.status === 409 && (parsed as { busy?: unknown } | null)?.busy === true
    if (busy && attempt < busyRetries) {
      await new Promise((resolve) => setTimeout(resolve, BUSY_WAIT_MS))
      continue
    }
    return { body: parsed, ok: response.ok, status: response.status }
  }
}

const BUSY_WAIT_MS = 3_000
/** Three minutes of waiting, which outlasts the two-minute lease. */
const BUSY_RETRIES = 60
