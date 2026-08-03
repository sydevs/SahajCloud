/**
 * Server-side Cloudflare Turnstile verification.
 *
 * A captcha token proves a *browser* solved the challenge; only the siteverify
 * call proves the token is real, unexpired, and unspent. Tokens are single-use,
 * so a replay of a previously-redeemed token fails here exactly like a forged one.
 *
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * **Fails closed.** An unset `TURNSTILE_SECRET_KEY`, a network error, or a
 * non-2xx from Cloudflare all return `{ success: false }` with a reason — never
 * a pass. There is deliberately no dev/test bypass: a captcha gate that silently
 * disables itself when misconfigured is worse than no gate, because nothing
 * surfaces the misconfiguration. Point `TURNSTILE_SECRET_KEY` at Cloudflare's
 * always-passes test key (`1x0000000000000000000000000000000AA`) in local
 * development instead — see `.env.example`.
 */
import { serverEnv } from '@/lib/env/server'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Cloudflare can be slow under load; bound the wait so a hung call can't hold the request open. */
const VERIFY_TIMEOUT_MS = 10_000

/**
 * Why a verification failed. `error-codes` are Cloudflare's own (e.g.
 * `invalid-input-response`, `timeout-or-duplicate` for a reused token); the
 * `reason` distinguishes our own local failures from Cloudflare's verdict so a
 * misconfiguration is visible in the logs rather than looking like a bad token.
 */
export type TurnstileVerification =
  | { success: true }
  | {
      success: false
      /** Where the failure came from: our config, the network, or Cloudflare's verdict. */
      reason: 'not-configured' | 'request-failed' | 'rejected'
      /** Cloudflare's `error-codes`, when it returned a verdict. */
      errorCodes?: string[]
    }

/** Shape of a siteverify response — only the fields we consume. */
interface SiteverifyResponse {
  success?: boolean
  'error-codes'?: string[]
}

/**
 * Verify a Turnstile token against Cloudflare.
 *
 * @param token - The `cf-turnstile-response` token the widget produced.
 * @param remoteIp - The end user's IP (`CF-Connecting-IP`), when known. Optional
 *   per Cloudflare; passing it lets them factor the client address into the
 *   verdict.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string | null,
): Promise<TurnstileVerification> {
  const secret = serverEnv.TURNSTILE_SECRET_KEY
  if (!secret) return { success: false, reason: 'not-configured' }

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  let result: SiteverifyResponse
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })
    if (!response.ok) return { success: false, reason: 'request-failed' }
    result = (await response.json()) as SiteverifyResponse
  } catch {
    // Network error, timeout, or an unparseable body — indistinguishable from
    // here, and all equally "we could not confirm this token".
    return { success: false, reason: 'request-failed' }
  }

  if (result.success === true) return { success: true }
  return { success: false, reason: 'rejected', errorCodes: result['error-codes'] ?? [] }
}
