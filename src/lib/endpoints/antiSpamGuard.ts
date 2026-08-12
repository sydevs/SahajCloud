import type { PayloadRequest } from 'payload'

import { isValid as mailcheckerIsValid } from 'mailchecker'
import { z } from 'zod'

import { verifyTurnstileToken } from '@/lib/turnstile/verifyTurnstile'

/**
 * Shared anti-spam checks for the public write surface.
 *
 * Pure result-object helpers, deliberately transport-agnostic: the write-guard
 * plugin (`@/plugins/writeGuard`) maps failures to thrown Payload errors on
 * collection writes, and the root `contactAdmin` endpoint (which no plugin
 * covers) maps them to `Response`s. Both surfaces therefore reject with the
 * same machine codes, which the client apps rely on for their error copy.
 *
 * Kept synchronous-cheap: Turnstile is one bounded HTTPS call (fail-closed,
 * see `@/lib/turnstile`), the email checks are an in-memory list, and the URL
 * scan is a regex. The slow/deep checks (MX lookups) belong to the async
 * screening job, not here.
 */

/** Machine-readable failure codes, shared with the client apps' error copy. */
export type AntiSpamCode =
  | 'captcha_failed'
  | 'captcha_unavailable'
  | 'invalid_email'
  | 'disposable_email'
  | 'urls_not_allowed'

export interface AntiSpamFailure {
  ok: false
  code: AntiSpamCode
  /** HTTP status the failure maps to (403 captcha verdict, 500 our failure, 400 otherwise). */
  status: number
  /** Human-readable message, safe to show the sender. */
  message: string
  /** The offending field, when the check is per-field (URL scan / email). */
  field?: string
}

export type AntiSpamResult = { ok: true } | AntiSpamFailure

const emailSchema = z.string().email()

/**
 * Verify a Turnstile token, logging like the original contactAdmin gate:
 * Cloudflare's verdict (forged / expired / replayed) is a 403 the sender can
 * retry; our own failure (unset secret, unreachable Cloudflare) is a 500 and
 * never a pass — a captcha gate that silently disables itself is worse than
 * no gate.
 */
export async function verifyTurnstileOrFail(
  req: PayloadRequest,
  token: string | null | undefined,
): Promise<AntiSpamResult> {
  // Cloudflare sets CF-Connecting-IP at the edge; it's absent for a direct
  // origin hit, which siteverify tolerates (remoteip is optional).
  const remoteIp = req.headers?.get?.('cf-connecting-ip')
  const verification = await verifyTurnstileToken(token ?? '', remoteIp)

  if (verification.success) return { ok: true }

  if (verification.reason === 'rejected') {
    req.payload.logger.warn({
      msg: 'antiSpamGuard: Turnstile token rejected',
      clientId: req.user?.id,
      errorCodes: verification.errorCodes,
    })
    return {
      ok: false,
      code: 'captcha_failed',
      status: 403,
      message: 'Captcha verification failed. Please try again.',
    }
  }

  req.payload.logger.error({
    msg: 'antiSpamGuard: Turnstile verification could not be completed',
    clientId: req.user?.id,
    reason: verification.reason,
  })
  return {
    ok: false,
    code: 'captcha_unavailable',
    status: 500,
    message: 'Could not verify the captcha. Please try again later.',
  }
}

/**
 * Reject an email that is malformed or from a disposable-domain provider
 * (mailchecker's list — the same check the async screening job re-runs, so a
 * sync rejection here is just faster feedback, not the only line of defence).
 * A nullish email passes: optional fields stay optional.
 */
export function checkEmailAllowed(
  email: string | null | undefined,
  field = 'email',
): AntiSpamResult {
  if (email == null || email === '') return { ok: true }

  if (!emailSchema.safeParse(email).success) {
    return {
      ok: false,
      code: 'invalid_email',
      status: 400,
      message: 'Enter a valid email address.',
      field,
    }
  }

  if (!mailcheckerIsValid(email)) {
    return {
      ok: false,
      code: 'disposable_email',
      status: 400,
      message: 'Disposable email addresses are not accepted — use a real address we can reach.',
      field,
    }
  }

  return { ok: true }
}

/**
 * What counts as "a URL" in free text: an explicit protocol, a `www.` host, or
 * a bare domain on one of the TLDs spam overwhelmingly uses. Deliberately NOT
 * a full bare-domain matcher — `7pm.Meet` and `e.g.` must not trip it; a spam
 * link on an exotic TLD still needs `http://` or `www.` to be clickable
 * anywhere, so the conservative pattern loses little.
 */
const URL_PATTERN =
  /https?:\/\/|www\.[a-z0-9-]|[a-z0-9-]+\.(?:com|net|org|info|biz|xyz|site|online|top|club|shop|link|click)\b/i

/**
 * Scan named free-text fields for URLs. Returns the failure naming the first
 * offending field, or ok. Dedicated URL fields (website, onlineUrl, …) are
 * simply not passed in — the caller chooses the scanned set.
 */
export function checkNoUrls(fields: Record<string, unknown>): AntiSpamResult {
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value === 'string' && URL_PATTERN.test(value)) {
      return {
        ok: false,
        code: 'urls_not_allowed',
        status: 400,
        message: `Links are not allowed in "${field}". Use the dedicated website field instead.`,
        field,
      }
    }
  }
  return { ok: true }
}

/**
 * Map a failure to the standard error envelope `Response` (for root endpoints).
 * `captcha_unavailable` (our own 500) deliberately ships no `code`: a public
 * caller must not learn whether the secret is unset or Cloudflare is down —
 * the pinned contract from the original contactAdmin gate.
 */
export function antiSpamErrorResponse(failure: AntiSpamFailure): Response {
  const body =
    failure.code === 'captcha_unavailable'
      ? { errors: [{ message: failure.message }] }
      : { errors: [{ message: failure.message, code: failure.code }] }
  return Response.json(body, { status: failure.status })
}
