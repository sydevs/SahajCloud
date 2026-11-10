/**
 * The one capture body behind every message this service reports — a warning
 * that is not an exception, plus the few notices and errors that are not one
 * either. `captureFailure` is its twin for an exception, and both tag the
 * deployment through `captureTags`.
 *
 * ⚠ **Never throws.** Unlike `captureFailure`, most sites here report from a
 * path that is otherwise succeeding — a proposal that was delivered, a signup
 * that was accepted — so a telemetry error would turn a working operation into
 * a failed one.
 *
 * ⚠ **Not gated on `NEXT_PUBLIC_SENTRY_DSN`**, unlike `sentryPlugin`:
 * `Sentry.captureMessage` is a no-op on an uninitialised SDK, and the logger
 * mirror is the half a deployment without a DSN can still read.
 */
import type { Payload } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { captureTags } from './tags'

/** Pino's name for each level, for the mirror. Sentry spells one of them `warning`. */
const LOG_METHOD = { error: 'error', info: 'info', warning: 'warn' } as const

export interface CaptureMessageArgs {
  message: string
  /**
   * Named contexts, each rendered as its own card. An `extra` is the default —
   * reach for this only where a site already had one.
   */
  contexts?: Record<string, Record<string, unknown>>
  extra?: Record<string, unknown>
  /** Groups repeats of one report into one issue. */
  fingerprint?: string[]
  /** Defaults to `warning`. A site reporting at any other level says why. */
  level?: keyof typeof LOG_METHOD
  /**
   * Mirror the message to the application log, as `{ msg, ...extra }`.
   *
   * Opt-in, because two sites say something else there: one logs an aggregate
   * for a whole run of reports, and the mail adapter's own line carries detail
   * the report deliberately omits.
   */
  logger?: Pick<Payload['logger'], 'error' | 'info' | 'warn'>
  /** Tags beside `environment`. */
  tags?: Record<string, unknown>
  /**
   * ⚠ **A caller's IP belongs here, never in an `extra`** — `user.ip_address`
   * is the only field `sendDefaultPii: false` and the project's "Prevent
   * Storing of IP Addresses" setting act on. An `extra` is opaque context no
   * scrubber reaches.
   */
  user?: { id?: string; ip_address?: string }
}

/** Report something that is not an exception. */
export const captureMessage = ({
  message,
  contexts,
  extra,
  fingerprint,
  level = 'warning',
  logger,
  tags,
  user,
}: CaptureMessageArgs): void => {
  try {
    logger?.[LOG_METHOD[level]]({ msg: message, ...extra })
    Sentry.captureMessage(message, {
      contexts,
      extra,
      fingerprint,
      level,
      tags: captureTags(tags),
      user,
    })
  } catch {
    // Deliberately silent, for the reason in the docblock.
  }
}
