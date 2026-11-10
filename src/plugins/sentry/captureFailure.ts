/**
 * How a **routed** failure is classified before `capture` reports it: Payload's
 * root `afterError` hook, the Local API wrapper and every failed job run
 * (#1039), and the two managers sign-in paths — the page's action and the
 * magic-link endpoint. Each hands an error and one of four `CaptureSource`
 * values; the level, the tags, the extras and the fingerprint are derived here.
 * A second copy of the exclusions would let one site report what another
 * deliberately drops.
 *
 * ⚠ **This classifies; it does not send.** `capture` owns the never-throw
 * guard, the tags and the one call into the SDK, so an ordinary site reporting
 * without a `source` cannot end up with a different policy.
 *
 * ⚠ **Never throws**, and keeps its own `try` for that: the three readers it
 * derives from — the cast-error map, the rejection describer and the validation
 * reader — run before `capture` is reached. Every site calls this while already
 * handling a failure.
 */
import type { PayloadRequest } from 'payload'

import { mapPostgresCastError } from '@/lib/databaseErrors'
import { isRecord } from '@/lib/utilities/isRecord'
import { validationFieldErrors } from '@/lib/utilities/validationFailure'

import { capture } from './capture'
import { describeRejectedCredential } from './credentialRejection'

/**
 * The `capture_source` tag. A routed failure and a swallowed admin write can
 * carry the same error class, and only this tells them apart in Sentry.
 */
export type CaptureSource = 'afterError' | 'job' | 'localApi' | 'signIn'

export interface CaptureFailureArgs {
  /** Collection or global slug, where the failure names one. */
  collection?: string
  error: unknown
  req?: PayloadRequest
  source: CaptureSource
  /** The status the failure would answer with. Defaults to the error's own, or 500. */
  status?: number
  /**
   * What a scheduled publish was for — `pages/12`, or a global's slug — so one
   * failing schedule can be told from another.
   */
  target?: string
  /** A failure the task marked as an answer (`ExpectedJobFailure`): sent at `warning`. */
  expected?: boolean
  /** The job run that failed, for a `job` source. */
  job?: { id: string; task: string }
  /** Who acted, for a site that holds no request. `req.user` wins where it exists. */
  user?: { id: string }
}

export const errorStatus = (error: unknown): number =>
  isRecord(error) && typeof error.status === 'number' ? error.status : 500

const defined = (record: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))

/** Report a failed operation. Returns whether an event was sent. */
export const captureFailure = ({
  collection,
  error,
  req,
  source,
  status,
  expected = false,
  job,
  target,
  user: actingUser,
}: CaptureFailureArgs): boolean => {
  try {
    // A Postgres cast failure is the caller sending a value the column cannot
    // hold — a 400, not an incident.
    // ⚠ **This suppresses a 22P02 OUR code composed too.** Do not discriminate
    // on `req.user`: access control denies an anonymous read before any SQL
    // runs. `docs/architecture.md` has the trade. (sydevs/SahajCloud#670)
    if (mapPostgresCastError(error)) return false

    // ⚠ Resolved inside the `try`, not as a parameter default: `errorStatus`
    // reads the error's own `status`, and a default is evaluated before the
    // body — so a throwing getter would escape the never-throw guarantee.
    const answered = status ?? errorStatus(error)

    // A presented-and-rejected credential is a broken integration, not traffic —
    // only below 500, and only on the hook: the other sites hold an acting user
    // or no request at all.
    // ⚠ This also writes the WARN mirror, which a deployment without
    // `NEXT_PUBLIC_SENTRY_DSN` never gets from the hook. `requireActiveClient`'s
    // path has no such gate (#743).
    const rejected =
      req && answered < 500 && source === 'afterError'
        ? describeRejectedCredential(req, { status: answered, source: 'sentryPlugin' })
        : null

    // ⚠ **The field PATHS, never the message**: a `ValidationError`'s message
    // carries localised labels.
    const fields = validationFieldErrors(error)?.map(({ path }) => path)

    return capture({
      error,
      // A swallowed admin write, or a scheduled publish that never happened, is
      // the whole incident whatever its status.
      // ⚠ **Accepted risk: a rejected credential's level is caller-triggerable**
      // with a junk `Authorization` header; mute it Sentry-side on
      // `auth_outcome`, never by dropping the level. (#734)
      level: expected
        ? 'warning'
        : source === 'localApi' || source === 'job' || rejected || answered >= 500
          ? 'error'
          : 'warning',
      // ⚠ **The IP belongs on `user.ip_address`, never in an `extra`** — the
      // only field `sendDefaultPii: false` and the project's IP setting act on.
      // A rejected caller has no `req.user`, so the arms never overlap.
      user: req?.user
        ? {
            id: String(req.user.id),
            email: 'email' in req.user ? String(req.user.email) : undefined,
          }
        : actingUser,
      ip: rejected?.ip,
      tags: {
        locale: req?.locale,
        collection,
        target,
        task: job?.task,
        job_id: job?.id,
        capture_source: source,
        ...rejected?.tags,
      },
      extra: defined({
        status: answered,
        url: req?.url,
        fields: fields?.length ? fields : undefined,
        userAgent: rejected?.userAgent,
      }),
      // A rejected key opens one issue per collection, wherever it was denied.
      fingerprint: rejected?.fingerprint,
    })
  } catch {
    return false
  }
}
