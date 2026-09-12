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

import { classifyAuthAttempt, type AuthAttempt } from './authAttempt'

/**
 * The one string both denial paths log and capture.
 *
 * ⚠ **One spelling, on purpose.** Prefixing it per call site would split the
 * Railway log query the same way two fingerprints split a Sentry issue. `source`
 * below says which path denied.
 */
export const CREDENTIAL_REJECTED_MESSAGE = 'API credential presented and rejected'

/** Which denial path saw it. Payload's error hook, or the endpoint guard. */
export type RejectionSource = 'sentryPlugin' | 'requireActiveClient'

/** A request whose `Authorization` header authenticated nobody, and its caller. */
export interface RejectedCredential {
  attempt: AuthAttempt
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
 * The rejection facts for a request, or `null` when the credential is not what
 * was wrong with it — no header at all, or a caller who did authenticate.
 *
 * Reads every field defensively: a denial must survive a request stub that
 * carries no `headers` and no `payload`.
 */
export const detectRejectedCredential = (req: PayloadRequest): RejectedCredential | null => {
  const attempt = classifyAuthAttempt(
    req.headers?.get?.('authorization'),
    Boolean(req.user),
    // `hasOwn`, not `in`: a header naming `toString` must not read as a real
    // collection off the prototype chain.
    (slug) => Object.hasOwn(req.payload?.collections ?? {}, slug),
  )
  if (attempt.outcome !== 'rejected') return null

  // Read `cf-connecting-ip` the same way `verifyTurnstileOrFail` does.
  return {
    attempt,
    userAgent: req.headers?.get?.('user-agent') ?? undefined,
    ip: req.headers?.get?.('cf-connecting-ip') ?? undefined,
  }
}

/**
 * The Sentry tags every rejected-credential report carries.
 *
 * Tags, not extras, despite the fingerprint's cardinality: naming WHICH
 * integration is broken is the point, and only a tag is searchable.
 */
export const rejectedCredentialTags = ({
  attempt,
}: RejectedCredential): Record<string, string | undefined> => ({
  auth_outcome: attempt.outcome,
  auth_collection: attempt.authCollection,
  auth_scheme: attempt.authScheme,
  key_fingerprint: attempt.keyFingerprint,
})

/**
 * Group by the collection, never by the key fingerprint: one broken integration
 * must not open one Sentry issue per key it presents. `classifyAuthAttempt` has
 * already checked the slug against the real collection list, so this stays
 * bounded. The `key_fingerprint` tag segments within the group.
 */
export const rejectedCredentialFingerprint = (
  { attempt }: RejectedCredential,
  status: number,
): string[] => ['credential-rejected', String(status), attempt.authCollection ?? 'unknown']

/**
 * Mirror the denial to the application log at WARN, so it stays diagnosable
 * from Railway without opening Sentry — the shape `assertClientOriginAllowed`
 * uses.
 */
export const logRejectedCredential = (
  req: PayloadRequest,
  rejected: RejectedCredential,
  { status, source }: { status: number; source: RejectionSource },
): void => {
  req.payload?.logger?.warn({
    msg: CREDENTIAL_REJECTED_MESSAGE,
    source,
    status,
    url: req.url,
    ...rejected.attempt,
    userAgent: rejected.userAgent,
    ip: rejected.ip,
  })
}

/**
 * The status `requireActiveClient` denies with.
 *
 * ⚠ **Inlined, not a parameter.** The guard is the only caller and returns
 * exactly this, so an options object would be a knob with one value.
 * `logRejectedCredential` still takes a status, because the error hook passes
 * whatever the response carried.
 */
const GUARD_DENIAL_STATUS = 403

/**
 * How long one key fingerprint's Sentry event stands for, in this process.
 *
 * ⚠ **Bounds the capture, never the log.** The WARN line is written for every
 * denial: it is cheap, it needs no DSN, and it is the half a local run and a
 * Railway query can see. The Sentry event is the half that costs quota, and a
 * broken integration retrying 500 times a minute says nothing in the second
 * event that the first did not.
 *
 * Per process, so N instances report at most N times per window — a bound, not
 * a guarantee of one. Bounding it here is what makes the level safe to keep
 * while the Sentry-side mute rule on `auth_outcome` does not yet exist.
 */
const CAPTURE_WINDOW_MS = 60_000

/**
 * How many fingerprints the window remembers before it is dropped wholesale.
 *
 * ⚠ **A caller mints fingerprints for free** — one per `Authorization` value it
 * invents — so this map is caller-controlled and must never grow unbounded.
 * Expired entries go first, and a map still full after that is cleared: losing
 * the window costs duplicate events, never memory.
 */
const CAPTURE_WINDOW_MAX_KEYS = 1_000

const capturedAt = new Map<string, number>()

/**
 * Whether this fingerprint's rejection is the first of its window, claiming the
 * window for it when it is. A credential carrying no fingerprint always
 * reports — `classifyAuthAttempt` gives every `rejected` outcome one, and a
 * missing one must not silently collapse distinct integrations into one entry.
 */
const claimCaptureWindow = (fingerprint: string | undefined, now: number): boolean => {
  if (!fingerprint) return true

  const captured = capturedAt.get(fingerprint)
  if (captured !== undefined && now - captured < CAPTURE_WINDOW_MS) return false

  if (capturedAt.size >= CAPTURE_WINDOW_MAX_KEYS) {
    for (const [key, at] of capturedAt) if (now - at >= CAPTURE_WINDOW_MS) capturedAt.delete(key)
    if (capturedAt.size >= CAPTURE_WINDOW_MAX_KEYS) capturedAt.clear()
  }

  capturedAt.set(fingerprint, now)
  return true
}

/**
 * Forget every claimed window.
 *
 * ⚠ **Tests only.** They share one module instance, so without this the second
 * spec to present a given key would assert against a suppressed capture.
 */
export const __resetCredentialCaptureWindowForTests = (): void => capturedAt.clear()

/**
 * Report a denial that never throws, so no `afterError` hook will.
 *
 * Safe to call on **every** denial: it returns at once unless a credential was
 * both presented and refused, so an anonymous 403 produces no new signal.
 *
 * ⚠ **Never throws.** A telemetry failure must not turn a caller's 403 into a
 * 500, and this runs on the request's denial path rather than its error path.
 *
 * ⚠ **Amplification, inherited from #734 and wider here.** These endpoints are
 * public, and #734's path needed a Payload route that throws. Cloudflare's edge
 * allows 500 req/min per (client, IP), so one stale integration could otherwise
 * buy ~720k `error` events a day, and the mute — a Sentry rule on
 * `auth_outcome` — is external to this repo and may not exist. So the capture
 * is deduped per key fingerprint here instead (`CAPTURE_WINDOW_MS`), which
 * bounds the volume without dropping the level. The level is the signal.
 * Grouping stays bounded by the collection check, so the residual cost is log
 * volume, never one Sentry issue per value invented.
 *
 * ⚠ **Not gated on `NEXT_PUBLIC_SENTRY_DSN`**, unlike `sentryPlugin`, which
 * returns the config untouched without one. `Sentry.captureMessage` is a no-op
 * on an uninitialised SDK, and the WARN line is the half a local run can see.
 */
export const reportRejectedCredential = (req: PayloadRequest): void => {
  const status = GUARD_DENIAL_STATUS

  try {
    const rejected = detectRejectedCredential(req)
    if (!rejected) return

    // Logged before the capture: it is the signal that needs no DSN, no
    // network, and no initialised SDK.
    //
    // ⚠ **Its own `try`, on purpose.** Sharing the outer one would let a
    // `logger.warn` that throws cost the Sentry event too — and the event is
    // the half that survives a deploy nobody is tailing.
    try {
      logRejectedCredential(req, rejected, { status, source: 'requireActiveClient' })
    } catch {
      // Deliberately silent, for the reason the outer `catch` gives.
    }

    // One event per fingerprint per window. See `CAPTURE_WINDOW_MS`.
    if (!claimCaptureWindow(rejected.attempt.keyFingerprint, Date.now())) return

    Sentry.withScope((scope) => {
      scope.setLevel('error')
      Object.entries({
        environment: deploymentEnvironment(),
        ...rejectedCredentialTags(rejected),
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
      scope.setFingerprint(rejectedCredentialFingerprint(rejected, status))
      Sentry.captureMessage(CREDENTIAL_REJECTED_MESSAGE, 'error')
    })
  } catch {
    // Deliberately silent. The caller is mid-denial and has no way to handle
    // this, and a logger that just failed cannot report its own failure.
  }
}
