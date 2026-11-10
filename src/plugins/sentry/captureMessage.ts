/**
 * The one capture body behind every message this service reports — a warning,
 * and the few notices and errors that are not exceptions. `captureFailure` is
 * its twin for an exception.
 *
 * ⚠ **Never throws.** Unlike `captureFailure`, a site here reports from a path
 * that is otherwise succeeding, so a telemetry error would fail a working
 * operation.
 *
 * ⚠ **Not gated on `NEXT_PUBLIC_SENTRY_DSN`**, unlike `sentryPlugin`: the
 * capture is a no-op on an uninitialised SDK, and the logger mirror is the half
 * a deployment without a DSN can still read.
 */
import type { Payload } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { captureTags } from './tags'

/** Pino's name for each level. Sentry spells one of them `warning`. */
const LOG_METHOD = { error: 'error', info: 'info', warning: 'warn' } as const

interface CaptureMessageArgs {
  message: string
  extra?: Record<string, unknown>
  fingerprint?: string[]
  /**
   * ⚠ **A caller's IP belongs here, never in an `extra`.** `user.ip_address` is
   * the only field `sendDefaultPii: false` and the project's "Prevent Storing
   * of IP Addresses" setting act on; an `extra` is opaque context no scrubber
   * reaches.
   */
  ip?: string
  /** A site reporting at any level but `warning` says why. */
  level?: keyof typeof LOG_METHOD
  /** Opt-in: a site that writes its own log line leaves this out. */
  logger?: Pick<Payload['logger'], 'error' | 'info' | 'warn'>
  tags?: Record<string, unknown>
}

export const captureMessage = ({
  message,
  extra,
  fingerprint,
  ip,
  level = 'warning',
  logger,
  tags,
}: CaptureMessageArgs): void => {
  try {
    logger?.[LOG_METHOD[level]]({ msg: message, ...extra })
    Sentry.captureMessage(message, {
      extra,
      fingerprint,
      level,
      tags: captureTags(tags),
      user: ip ? { ip_address: ip } : undefined,
    })
  } catch {
    // Deliberately silent, for the reason in the docblock.
  }
}
