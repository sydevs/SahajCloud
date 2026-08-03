/**
 * Unit tests for the Cloudflare Turnstile server-side verifier.
 *
 * Pure — no Payload bootstrap. `fetch` is stubbed, so these pin the two things
 * that matter about a captcha gate: it passes only on an explicit Cloudflare
 * `success: true`, and every other outcome (unset secret, network error, non-2xx,
 * unparseable body, explicit rejection) **fails closed** with a reason that says
 * which. A verifier that silently passes when misconfigured is worse than no
 * verifier at all, so the not-configured case is asserted as hard as the rest.
 *
 * `serverEnv` caches its parsed result on first access, so each test resets the
 * module registry and re-imports — the same pattern `server-env.spec.ts` uses.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

type FetchSpy = ReturnType<typeof vi.fn>

/**
 * Load a fresh copy of the verifier with `TURNSTILE_SECRET_KEY` set to `secret`
 * (omit to leave it unset). Fresh because `serverEnv` memoizes the whole parsed
 * environment the first time any key is read.
 */
async function loadVerifier(secret?: string) {
  vi.resetModules()
  if (secret === undefined) {
    delete process.env.TURNSTILE_SECRET_KEY
  } else {
    process.env.TURNSTILE_SECRET_KEY = secret
  }
  const { verifyTurnstileToken } = await import('../../src/lib/turnstile/verifyTurnstile')
  return verifyTurnstileToken
}

/** Stub `fetch` with a JSON body + status, returning the spy for assertions. */
function stubFetch(body: unknown, status = 200): FetchSpy {
  const spy = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', spy)
  return spy
}

/** Read the form-encoded body the verifier posted. */
function postedBody(spy: FetchSpy): URLSearchParams {
  const init = spy.mock.calls[0]?.[1] as RequestInit | undefined
  return init?.body as URLSearchParams
}

describe('verifyTurnstileToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    delete process.env.TURNSTILE_SECRET_KEY
  })

  it('passes on an explicit success and posts the secret + token to siteverify', async () => {
    const spy = stubFetch({ success: true })
    const verify = await loadVerifier('test-secret')

    await expect(verify('tok-123')).resolves.toEqual({ success: true })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toBe(SITEVERIFY_URL)
    const body = postedBody(spy)
    expect(body.get('secret')).toBe('test-secret')
    expect(body.get('response')).toBe('tok-123')
    // Omitted, not sent empty — siteverify treats remoteip as optional.
    expect(body.has('remoteip')).toBe(false)
  })

  it('forwards the caller IP as remoteip when one is known', async () => {
    const spy = stubFetch({ success: true })
    const verify = await loadVerifier('test-secret')

    await verify('tok-123', '203.0.113.7')

    expect(postedBody(spy).get('remoteip')).toBe('203.0.113.7')
  })

  it('reports Cloudflare’s rejection verbatim, including a replayed token', async () => {
    // `timeout-or-duplicate` is what a reused token returns — tokens are single-use.
    stubFetch({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    const verify = await loadVerifier('test-secret')

    await expect(verify('tok-reused')).resolves.toEqual({
      success: false,
      reason: 'rejected',
      errorCodes: ['timeout-or-duplicate'],
    })
  })

  it('reports a rejection with no error-codes as an empty list, not undefined', async () => {
    stubFetch({ success: false })
    const verify = await loadVerifier('test-secret')

    await expect(verify('tok-bad')).resolves.toEqual({
      success: false,
      reason: 'rejected',
      errorCodes: [],
    })
  })

  it('fails closed — and never calls Cloudflare — when the secret is unset', async () => {
    const spy = stubFetch({ success: true })
    const verify = await loadVerifier()

    await expect(verify('tok-123')).resolves.toEqual({
      success: false,
      reason: 'not-configured',
    })
    // The distinction matters: a misconfigured gate must be visible in the logs
    // as *our* failure, not as a bad token.
    expect(spy).not.toHaveBeenCalled()
  })

  it('fails closed on a non-2xx from Cloudflare', async () => {
    stubFetch({ success: true }, 500)
    const verify = await loadVerifier('test-secret')

    await expect(verify('tok-123')).resolves.toEqual({
      success: false,
      reason: 'request-failed',
    })
  })

  it('fails closed on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET')
      }),
    )
    const verify = await loadVerifier('test-secret')

    await expect(verify('tok-123')).resolves.toEqual({
      success: false,
      reason: 'request-failed',
    })
  })

  it('fails closed on an unparseable body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>gateway error</html>', { status: 200 })),
    )
    const verify = await loadVerifier('test-secret')

    await expect(verify('tok-123')).resolves.toEqual({
      success: false,
      reason: 'request-failed',
    })
  })
})
