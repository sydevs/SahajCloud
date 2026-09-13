/**
 * Reporting a presented-and-rejected credential, from either denial path.
 *
 * Two things deny a request. Payload's root `afterError` hook sees everything
 * that **throws**. `requireActiveClient` denies by **returning** a 403, so that
 * hook never runs for it and fifteen custom endpoints — `/api/atlas/seo` and
 * `/api/atlas/sitemap` among them — reported nothing at all (#743).
 *
 * Both report the same facts, so the facts are built once, here. A second copy
 * of the tag names or the fingerprint shape would split one Sentry issue in two,
 * which is the failure #734 exists to undo.
 *
 * ⚠ **Nothing here may emit the credential, or any substring of it.** The only
 * value derived from the key is `classifyAuthAttempt`'s truncated SHA-256.
 *
 * Why the signal exists and what it still cannot see: `docs/architecture.md`.
 */
import type { PayloadRequest } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'

import { classifyAuthAttempt } from './authAttempt'

/**
 * The one string both denial paths log and capture.
 *
 * ⚠ **One spelling, on purpose.** Prefixing it per call site would split the
 * Railway log query the same way two fingerprints split a Sentry issue. The
 * `source` field below says which path denied.
 */
export const CREDENTIAL_REJECTED_MESSAGE = 'API credential presented and rejected'

/** Which denial path saw it. Payload's error hook, or the endpoint guard. */
export type RejectionSource = 'sentryPlugin' | 'requireActiveClient'

/** What a rejected credential contributes to whichever report the caller sends. */
export interface RejectedCredentialContext {
  /**
   * Tags, not extras, despite the fingerprint's cardinality: naming WHICH
   * integration is broken is the point, and only a tag is searchable.
   */
  tags: Record<string, string | undefined>
  /**
   * Grouped by the collection, never by the key fingerprint: one broken
   * integration must not open one Sentry issue per key it presents.
   * `classifyAuthAttempt` has already checked the slug against the real
   * collection list, so this stays bounded.
   */
  fingerprint: string[]
  /**
   * ⚠ **Trust these only as far as the edge.** Cloudflare sets
   * `CF-Connecting-IP`, but a caller reaching the Railway origin directly sets
   * both headers to whatever it likes. The key fingerprint is what actually
   * names an integration.
   */
  userAgent?: string
  ip?: string
}

/**
 * The Sentry context for a request whose `Authorization` header authenticated
 * nobody, or `null` when the credential is not what was wrong with it — no
 * header at all, or a caller who did authenticate.
 *
 * Mirrors the denial to the application log at WARN as it goes, so it stays
 * diagnosable from Railway without opening Sentry, and so neither caller can
 * spell the message differently.
 *
 * Reads every field defensively: a denial must survive a request stub that
 * carries no `headers` and no `payload`.
 */
export const describeRejectedCredential = (
  req: PayloadRequest,
  { status, source }: { status: number; source: RejectionSource },
): RejectedCredentialContext | null => {
  const attempt = classifyAuthAttempt(
    req.headers?.get?.('authorization'),
    Boolean(req.user),
    // `hasOwn`, not `in`: a header naming `toString` must not read as a real
    // collection off the prototype chain.
    (slug) => Object.hasOwn(req.payload?.collections ?? {}, slug),
  )
  if (attempt.outcome !== 'rejected') return null

  // Read `cf-connecting-ip` the same way `verifyTurnstileOrFail` does.
  const userAgent = req.headers?.get?.('user-agent') ?? undefined
  const ip = req.headers?.get?.('cf-connecting-ip') ?? undefined

  // ⚠ **Its own `try`, on purpose.** A `logger.warn` that throws must not cost
  // the caller its Sentry event — the half that survives a deploy nobody is
  // tailing.
  try {
    req.payload?.logger?.warn({
      msg: CREDENTIAL_REJECTED_MESSAGE,
      source,
      status,
      url: req.url,
      ...attempt,
      userAgent,
      ip,
    })
  } catch {
    // Deliberately silent: a logger that just failed cannot report its own failure.
  }

  return {
    tags: {
      auth_outcome: attempt.outcome,
      auth_collection: attempt.authCollection,
      auth_scheme: attempt.authScheme,
      key_fingerprint: attempt.keyFingerprint,
    },
    fingerprint: ['credential-rejected', String(status), attempt.authCollection ?? 'unknown'],
    userAgent,
    ip,
  }
}

/**
 * Report a denial that never throws, so no `afterError` hook will.
 *
 * Safe to call on **every** denial: it returns at once unless a credential was
 * both presented and refused, so an anonymous 403 produces no new signal.
 *
 * ⚠ **Never throws.** A telemetry failure must not turn a caller's 403 into a
 * 500, and this runs on the request's denial path rather than its error path.
 *
 * ⚠ **Not gated on `NEXT_PUBLIC_SENTRY_DSN`**, unlike `sentryPlugin`, which
 * returns the config untouched without one. `Sentry.captureMessage` is a no-op
 * on an uninitialised SDK, and the WARN line is the half a local run can see.
 */
export const reportRejectedCredential = (req: PayloadRequest): void => {
  // Inlined, not a parameter: the guard is the only caller and returns exactly
  // this. `describeRejectedCredential` still takes a status, because the error
  // hook passes whatever the response carried.
  const status = 403

  try {
    const rejected = describeRejectedCredential(req, { status, source: 'requireActiveClient' })
    if (!rejected) return

    Sentry.withScope((scope) => {
      scope.setLevel('error')
      Object.entries({
        environment: deploymentEnvironment(),
        ...rejected.tags,
      }).forEach(([key, value]) => {
        if (value) scope.setTag(key, value)
      })
      scope.setExtra('status', status)
      scope.setExtra('url', req.url)
      scope.setExtra('userAgent', rejected.userAgent)
      // ⚠ **The IP belongs on `user.ip_address`, never in an `extra`.**
      // `sendDefaultPii: false` and the project's "Prevent Storing of IP
      // Addresses" setting both act on that field alone; an `extra` is opaque
      // context no scrubber reaches.
      if (rejected.ip) scope.setUser({ ip_address: rejected.ip })
      scope.setFingerprint(rejected.fingerprint)
      Sentry.captureMessage(CREDENTIAL_REJECTED_MESSAGE, 'error')
    })
  } catch {
    // Deliberately silent. The caller is mid-denial and has no way to handle
    // this, and a logger that just failed cannot report its own failure.
  }
}
