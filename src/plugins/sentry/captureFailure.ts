/**
 * The one capture body behind every exception this plugin reports.
 *
 * Three sites send one: Payload's root `afterError` hook, for a failure a
 * routed request answers with; the Local API wrapper, for an admin write
 * swallowed inside `node_modules` (#1039); and the managers sign-in action,
 * which has no acting user by design. A second copy of the exclusions would let
 * one site report what another deliberately drops — `mapPostgresCastError` and
 * the rejected-credential levelling are both here for that reason.
 *
 * ⚠ **Never throws.** Every site calls this while already handling a failure,
 * and a telemetry error must not replace the one the caller is dealing with.
 *
 * ⚠ **Not gated on `NEXT_PUBLIC_SENTRY_DSN`**, unlike `sentryPlugin`, which
 * returns the config untouched without one. `Sentry.captureException` is a
 * no-op on an uninitialised SDK, and the sign-in action reaches this without
 * going through the plugin at all.
 */
import type { PayloadRequest } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { mapPostgresCastError } from '@/lib/databaseErrors'
import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'
import { isRecord } from '@/lib/utilities/isRecord'
import { validationFieldErrors } from '@/lib/utilities/validationFailure'

import { describeRejectedCredential } from './credentialRejection'

/** Context object for Sentry error capture */
export interface SentryContext {
  user?: {
    id?: string
    email?: string
    /**
     * The client IP. Sentry's own field for it, on purpose — the project's
     * "Prevent Storing of IP Addresses" setting and the SDK's PII scrubbers
     * both act on `user.ip_address` and neither can see an `extra`. Setting it
     * here keeps the org's kill switch working without a redeploy.
     */
    ip_address?: string
  }
  tags?: Record<string, string | undefined>
  extra?: Record<string, unknown>
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'
  /**
   * Overrides Sentry's default grouping. Set only where two errors that look
   * alike are different incidents — leave it unset and Sentry groups as usual.
   */
  fingerprint?: string[]
}

/** Custom context function to enrich Sentry error context */
export type SentryContextFn = (args: {
  defaultContext: SentryContext
  req: PayloadRequest
}) => Partial<SentryContext>

/**
 * Which seam reported, as the `capture_source` tag. A routed failure and a
 * swallowed admin write can carry the same error class, and only this tells
 * them apart in Sentry.
 */
export type CaptureSource = 'afterError' | 'localApi' | 'signIn'

export interface CaptureFailureArgs {
  /** Collection or global slug, where the failure names one. */
  collection?: string
  context?: SentryContextFn
  error: unknown
  /** Overrides the status-derived level. */
  level?: SentryContext['level']
  req?: PayloadRequest
  source: CaptureSource
  /** The status the failure would answer with. Defaults to 500. */
  status?: number
  /**
   * Who acted, for a site that knows but holds no request — `jobs.queue`, whose
   * admin caller passes only the queued input. `req.user` wins where it exists.
   */
  user?: SentryContext['user']
}

/**
 * ⚠ **One error instance reports once.** A hook's own Local API write nests
 * inside the admin write that triggered it, so a throw from the inner one
 * passes through both wrappers — and criterion 4 of #1039 is that nothing
 * reports twice.
 */
const reported = new WeakSet<object>()

/** The status a failure would answer with, or 500 for one that names none. */
export const errorStatus = (error: unknown): number =>
  isRecord(error) && typeof error.status === 'number' ? error.status : 500

/**
 * Report a failed operation to Sentry. Returns whether an event was sent, so a
 * caller can log its own debug line only when one was.
 */
export const captureFailure = ({
  collection,
  context,
  error,
  level,
  req,
  source,
  status = errorStatus(error),
  user: actingUser,
}: CaptureFailureArgs): boolean => {
  try {
    // A Postgres cast failure is the caller sending a value the column cannot
    // hold, so it is a 400 rather than an incident. `captureErrors` includes 400,
    // so restatusing alone would not stop the report — and asking the same pure
    // predicate rather than reading a flag the other hook sets keeps this
    // independent of the order the two plugins are registered in.
    //
    // ⚠ **This suppresses a 22P02 OUR code composed too**, not only a caller's.
    // Do not try to discriminate on `req.user`: access control denies an
    // anonymous read before any SQL runs, so it is set on every error that
    // reaches here. `docs/architecture.md` has the trade. (sydevs/SahajCloud#670)
    if (mapPostgresCastError(error)) {
      return false
    }

    if (isRecord(error)) {
      if (reported.has(error)) return false
      reported.add(error)
    }

    const tags: Record<string, string | undefined> = {
      environment: deploymentEnvironment(),
      locale: req?.locale,
      collection,
      capture_source: source,
    }
    const extra: Record<string, unknown> = { status, url: req?.url }

    // ⚠ **The field PATHS, never the message.** A `ValidationError`'s message
    // carries field labels, which are localised and change with the editor's
    // language. `tests/int/admin-write-capture.int.spec.ts` pins the paths
    // against a real failed write.
    const invalid = validationFieldErrors(error)
    if (invalid?.length) extra.fields = invalid.map(({ path }) => path)

    // A presented-and-rejected credential is a broken integration, not
    // traffic — but only below 500. The caller's credential is not what
    // is wrong with a 500, so nothing auth-related is computed there.
    //
    // Only the hook can see one: the other two sites either hold an acting
    // user already or carry no request at all, which is why `source` can be
    // spelled as a literal below.
    //
    // ⚠ This also writes the WARN mirror, and `sentryPlugin` returns the
    // config untouched when no `NEXT_PUBLIC_SENTRY_DSN` is set — so a
    // deployment without one gets neither the event nor that line from the
    // hook. Every deployed environment sets it; a local run that does not,
    // will not see it. `requireActiveClient`'s path has no such gate (#743).
    const rejected =
      req && status < 500 && source === 'afterError'
        ? describeRejectedCredential(req, { status, source: 'sentryPlugin' })
        : null

    if (rejected) {
      Object.assign(tags, rejected.tags)
      Object.assign(extra, { userAgent: rejected.userAgent })
    }

    // ⚠ **Accepted risk: this level is caller-triggerable.** Any anonymous
    // caller can raise a captured 400/403/404 to `error` by sending a junk
    // `Authorization` header. Grouping stays bounded by the collection check,
    // so the cost is event quota and alert noise, never one Sentry issue per
    // value. #734 leaves routing to a Sentry-side rule on `auth_outcome`,
    // which is where to mute this — not by dropping the level. (#734)
    const eventLevel = level ?? (rejected || status >= 500 ? 'error' : 'warning')

    // The two arms are mutually exclusive: `rejected` requires no `req.user`.
    // So a rejected caller's `user` carries the IP alone — the absent `id` is
    // what still says nobody authenticated, and `auth_outcome` says so
    // outright.
    //
    // ⚠ **The IP belongs on `user.ip_address`, never in an `extra`.**
    // `sendDefaultPii: false` and the project's "Prevent Storing of IP
    // Addresses" setting both act on that field alone; an `extra` is opaque
    // context no scrubber reaches.
    const user = req?.user
      ? {
          id: String(req.user.id),
          email: 'email' in req.user ? String(req.user.email) : undefined,
        }
      : (actingUser ?? (rejected?.ip ? { ip_address: rejected.ip } : undefined))

    const defaultContext: SentryContext = {
      user,
      tags,
      extra,
      level: eventLevel,
      /**
       * Grouped by the collection, so a rejected key opens one issue wherever
       * it was denied. Unset otherwise, and Sentry groups as usual.
       */
      fingerprint: rejected?.fingerprint,
    }

    const finalContext = context && req ? context({ defaultContext, req }) : defaultContext

    Sentry.withScope((scope) => {
      if (finalContext.user) {
        scope.setUser(finalContext.user)
      }
      if (finalContext.tags) {
        Object.entries(finalContext.tags).forEach(([key, value]) => {
          if (value) scope.setTag(key, value)
        })
      }
      if (finalContext.extra) {
        Object.entries(finalContext.extra).forEach(([key, value]) => {
          scope.setExtra(key, value)
        })
      }
      if (finalContext.level) {
        scope.setLevel(finalContext.level)
      }
      if (finalContext.fingerprint) {
        scope.setFingerprint(finalContext.fingerprint)
      }
      Sentry.captureException(error)
    })

    return true
  } catch {
    // Deliberately silent: the caller is mid-failure, and a reporter that just
    // failed cannot report its own failure.
    return false
  }
}
