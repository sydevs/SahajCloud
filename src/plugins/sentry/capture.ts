/**
 * The one capture body behind every report this service sends — an exception,
 * a warning, or a notice. It is the only place in `src/` that reaches
 * `Sentry.captureException` or `Sentry.captureMessage`, so no site can report
 * at a level, with tags, or without a guard that another site avoids.
 * `captureFailure` classifies a routed failure and reports through here;
 * every other site calls this directly.
 *
 * ⚠ **Never throws.** A site reports either from a path that is otherwise
 * succeeding, or from a `catch` already handling a failure. A telemetry error
 * must neither fail a working operation nor replace the failure the caller is
 * dealing with. The six per-item job sites that captured inline had no such
 * guard, so a Sentry transport error aborted a run written to continue.
 *
 * ⚠ **Not gated on `NEXT_PUBLIC_SENTRY_DSN`**, unlike `sentryPlugin`: the
 * capture is a no-op on an uninitialised SDK, and the logger mirror is the half
 * a deployment without a DSN can still read.
 *
 * ⚠ **Server-side only.** The browser reports through `clientLogger` and the
 * two React error boundaries, which carry a console mirror and a `getClient()`
 * check this body deliberately does not have.
 */
import type { Payload } from 'payload'

import * as Sentry from '@sentry/nextjs'

/** Pino's name for each level. Sentry spells one of them `warning`. */
const LOG_METHOD = { error: 'error', info: 'info', warning: 'warn' } as const

export type CaptureLevel = keyof typeof LOG_METHOD

/**
 * A tag is a non-empty string or absent: Sentry has no use for `''`.
 *
 * ⚠ **No `environment` tag.** Every event already carries an `environment`
 * FIELD, set by `Sentry.init` from `deploymentEnvironment()` on the server and
 * `clientDeploymentEnvironment()` in the browser — `sentry.server.config.ts`
 * and `instrumentation-client.ts`. That field is what the environment selector
 * and the alert rules read, so a tag beside it filtered nothing the field did
 * not already (#733 credited the tag with a fix that belongs to those two
 * `init` calls).
 */
const sentryTags = (record?: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(record ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  )

interface CaptureCommon {
  extra?: Record<string, unknown>
  fingerprint?: string[]
  /**
   * ⚠ **A caller's IP belongs here, never in an `extra`.** `user.ip_address` is
   * the only field `sendDefaultPii: false` and the project's "Prevent Storing
   * of IP Addresses" setting act on; an `extra` is opaque context no scrubber
   * reaches. Ignored where `user` names someone.
   */
  ip?: string
  /** Defaults to `error` for an exception and `warning` otherwise. */
  level?: CaptureLevel
  /** Opt-in: a site that writes its own log line leaves this out. */
  logger?: Pick<Payload['logger'], 'error' | 'info' | 'warn'>
  tags?: Record<string, string | undefined>
  /** Who acted. A site with no acting user passes `ip` instead, or nothing. */
  user?: { id: string; email?: string }
}

/**
 * A report names an exception, a message, or both. Neither alone is optional:
 * a capture with no subject at all reaches Sentry as an unsearchable event.
 */
export type CaptureArgs = CaptureCommon &
  (
    | { error: unknown; message?: string }
    | {
        error?: undefined
        /** What happened. Also the log mirror's `msg`. */
        message: string
      }
  )

/** Report to Sentry, and to the application log where a site asks. Returns whether an event was sent. */
export const capture = (args: CaptureArgs): boolean => {
  const {
    error,
    message,
    extra,
    fingerprint,
    ip,
    level = args.error === undefined ? 'warning' : 'error',
    logger,
    tags,
    user,
  } = args

  // ⚠ **Its own `try`, on purpose.** A logger that throws must not cost the
  // caller its Sentry event — the half that survives a deploy nobody is
  // tailing. `describeRejectedCredential` guards its own mirror the same way.
  if (logger) {
    try {
      // ⚠ `err`, pino's own serializer key, so the log line carries the stack
      // the message alone drops.
      logger[LOG_METHOD[level]]({
        msg: message,
        ...extra,
        ...(error !== undefined && { err: error }),
      })
    } catch {
      // Deliberately silent: a logger that just failed cannot report its own failure.
    }
  }

  try {
    const context = {
      extra,
      fingerprint,
      level,
      tags: sentryTags(tags),
      user: user ?? (ip ? { ip_address: ip } : undefined),
    }

    // An exception is the subject wherever a site has one; its `message` is
    // then the log mirror's alone. The type admits no third case.
    if (error !== undefined) Sentry.captureException(error, context)
    else if (message !== undefined) Sentry.captureMessage(message, context)

    // A nested write rethrows the same instance through both wrappers; the SDK's
    // `__sentry_captured__` mark drops each repeat, so nothing here dedupes.
    return true
  } catch {
    return false
  }
}
