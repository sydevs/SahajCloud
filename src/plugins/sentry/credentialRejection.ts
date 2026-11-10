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

import { classifyAuthAttempt } from './authAttempt'
import { captureNotice } from './captureNotice'

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

  // `cf-connecting-ip` only, not `verifyTurnstileOrFail`'s `x-client-ip`: a
  // rejected credential is no authenticated client, so that header is the
  // caller's own unverified claim (#808).
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
 * returns the config untouched without one — `captureNotice` owns that rule.
 * What is this function's own is the WARN line, which `describeRejectedCredential`
 * writes either way, so a local run sees the denial.
 */
export const reportRejectedCredential = (req: PayloadRequest): void => {
  // Inlined, not a parameter: the guard is the only caller and returns exactly
  // this. `describeRejectedCredential` still takes a status, because the error
  // hook passes whatever the response carried.
  const status = 403

  try {
    const rejected = describeRejectedCredential(req, { status, source: 'requireActiveClient' })
    if (!rejected) return

    captureNotice({
      message: CREDENTIAL_REJECTED_MESSAGE,
      extra: { status, url: req.url, userAgent: rejected.userAgent },
      fingerprint: rejected.fingerprint,
      // A dead integration is a broken caller, not traffic — the whole point of
      // #734. The throwing path reaches the same level through `rejected`.
      level: 'error',
      ip: rejected.ip,
      tags: rejected.tags,
    })
  } catch {
    // Deliberately silent: the caller is mid-denial and has no way to handle this.
  }
}
