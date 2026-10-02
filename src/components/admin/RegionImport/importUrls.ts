/**
 * Where each step of an import run posts, and the one condition under which the
 * run refuses to build a URL at all.
 *
 * ⚠ **No locale, no request.** Only the upload is locale-gated —
 * `mayStageImport` reads the grant for `req.locale`, so a manager who
 * coordinates in German holds nothing in English (#701). `useLocale()`'s context
 * default is `{}`, so `code` can be undefined at runtime, and interpolating it
 * yields `?locale=undefined`, which `sanitizeLocales` rewrites to the default
 * locale: the #701 403, reproduced silently. So this answers `null` and the
 * caller reports it, the same rule `SubmissionReview/urls.ts` follows.
 *
 * The later steps gate on ownership alone (`ownedRegionFilterOptions` reads no
 * locale) and carry the locale anyway, so the run has one shape and one guard.
 */

import { formatAdminURL } from 'payload/shared'

/** The steps a run walks, in order. */
export type ImportStep = 'upload' | 'resolve' | 'propose'

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
 * The message an endpoint refused with, read out of a body that may not be one.
 *
 * Every import endpoint answers `{ errors: [{ message }] }` (`failure`), and so
 * does Payload's own error handler — but a 502 from in front of the app answers
 * HTML, and `response.json()` having thrown is exactly when a caller most needs
 * something to show.
 */
export function refusalMessage(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback
  const { errors } = body as { errors?: unknown }
  if (!Array.isArray(errors)) return fallback

  const messages = errors
    .map((error) => (error as { message?: unknown } | null)?.message)
    .filter((message): message is string => typeof message === 'string' && message.length > 0)
  return messages.length ? messages.join(' ') : fallback
}
