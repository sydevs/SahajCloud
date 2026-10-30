/**
 * The one capture body behind every exception this plugin reports: Payload's
 * root `afterError` hook, the Local API wrapper (#1039), and the managers
 * sign-in action. A second copy of the exclusions would let one site report what
 * another deliberately drops.
 *
 * ⚠ **Never throws.** Every site calls this while already handling a failure,
 * and a telemetry error must not replace the one the caller is dealing with.
 *
 * ⚠ **Not gated on `NEXT_PUBLIC_SENTRY_DSN`**, unlike `sentryPlugin`: the
 * sign-in action reaches this without the plugin, and `captureException` is a
 * no-op on an uninitialised SDK.
 */
import type { PayloadRequest } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { mapPostgresCastError } from '@/lib/databaseErrors'
import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'
import { isRecord } from '@/lib/utilities/isRecord'
import { validationFieldErrors } from '@/lib/utilities/validationFailure'

import { describeRejectedCredential } from './credentialRejection'

/**
 * The `capture_source` tag. A routed failure and a swallowed admin write can
 * carry the same error class, and only this tells them apart in Sentry.
 */
export type CaptureSource = 'afterError' | 'localApi' | 'signIn'

export interface CaptureFailureArgs {
  /** Collection or global slug, where the failure names one. */
  collection?: string
  error: unknown
  req?: PayloadRequest
  source: CaptureSource
  /** The status the failure would answer with. Defaults to the error's own, or 500. */
  status?: number
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
  status = errorStatus(error),
  user: actingUser,
}: CaptureFailureArgs): boolean => {
  try {
    // A Postgres cast failure is the caller sending a value the column cannot
    // hold — a 400, not an incident.
    // ⚠ **This suppresses a 22P02 OUR code composed too.** Do not discriminate
    // on `req.user`: access control denies an anonymous read before any SQL
    // runs. `docs/architecture.md` has the trade. (sydevs/SahajCloud#670)
    if (mapPostgresCastError(error)) return false

    // A presented-and-rejected credential is a broken integration, not traffic —
    // only below 500, and only on the hook: the other sites hold an acting user
    // or no request at all.
    // ⚠ This also writes the WARN mirror, which a deployment without
    // `NEXT_PUBLIC_SENTRY_DSN` never gets from the hook. `requireActiveClient`'s
    // path has no such gate (#743).
    const rejected =
      req && status < 500 && source === 'afterError'
        ? describeRejectedCredential(req, { status, source: 'sentryPlugin' })
        : null

    // ⚠ **The field PATHS, never the message**: a `ValidationError`'s message
    // carries localised labels.
    const fields = validationFieldErrors(error)?.map(({ path }) => path)

    Sentry.captureException(error, {
      // A swallowed admin write is the whole incident whatever its status.
      // ⚠ **Accepted risk: a rejected credential's level is caller-triggerable**
      // with a junk `Authorization` header; mute it Sentry-side on
      // `auth_outcome`, never by dropping the level. (#734)
      level: source === 'localApi' || rejected || status >= 500 ? 'error' : 'warning',
      // ⚠ **The IP belongs on `user.ip_address`, never in an `extra`** — the
      // only field `sendDefaultPii: false` and the project's IP setting act on.
      // A rejected caller has no `req.user`, so the arms never overlap.
      user: req?.user
        ? {
            id: String(req.user.id),
            email: 'email' in req.user ? String(req.user.email) : undefined,
          }
        : (actingUser ?? (rejected?.ip ? { ip_address: rejected.ip } : undefined)),
      tags: defined({
        environment: deploymentEnvironment(),
        locale: req?.locale,
        collection,
        capture_source: source,
        ...rejected?.tags,
      }) as Record<string, string>,
      extra: defined({
        status,
        url: req?.url,
        fields: fields?.length ? fields : undefined,
        userAgent: rejected?.userAgent,
      }),
      // A rejected key opens one issue per collection, wherever it was denied.
      fingerprint: rejected?.fingerprint,
    })
    // A nested write rethrows the same instance through both wrappers; the SDK's
    // `__sentry_captured__` mark drops each repeat, so nothing here dedupes.
    return true
  } catch {
    return false
  }
}
