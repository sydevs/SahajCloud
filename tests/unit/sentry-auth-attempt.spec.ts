import { describe, expect, it } from 'vitest'

import { classifyAuthAttempt, credentialFingerprint } from '@/plugins/sentry/authAttempt'

const KEY = '3f7c1a2b-9d4e-4a10-8b55-6c2e0f9a1d33'

/** Stands in for the real collection list the plugin reads off `req.payload`. */
const isKnownCollection = (slug: string) => slug === 'clients' || slug === 'managers'

const classify = (authorization: string | null | undefined, hasUser = false) =>
  classifyAuthAttempt(authorization, hasUser, isKnownCollection)

describe('classifyAuthAttempt', () => {
  it.each([null, undefined, '', '   '])('reports no header (%p) as anonymous', (header) => {
    expect(classify(header)).toEqual({ outcome: 'anonymous' })
  })

  it('reports a header that authenticated as authenticated, with nothing to attribute', () => {
    expect(classify(`clients API-Key ${KEY}`, true)).toEqual({ outcome: 'authenticated' })
  })

  it('reports a cookie-authenticated caller as authenticated, not anonymous', () => {
    // A manager logged into the admin panel sends no `Authorization` header at
    // all. Asking "is there a header?" before "did anyone authenticate?" files
    // their 403 under `anonymous` — the one outcome it is not.
    expect(classify(null, true)).toEqual({ outcome: 'authenticated' })
  })

  it('reports a header that did not authenticate as rejected, naming the collection', () => {
    const attempt = classify(`clients API-Key ${KEY}`)

    expect(attempt.outcome).toBe('rejected')
    expect(attempt.authCollection).toBe('clients')
    expect(attempt.authScheme).toBe('API-Key')
    expect(attempt.keyFingerprint).toMatch(/^[0-9a-f]{12}$/)
  })

  it('names no collection for a slug that is not a real one', () => {
    // The slug reaches a Sentry fingerprint. Unbounded, any caller could mint
    // one Sentry issue per word it invents.
    const attempt = classify(`not-a-collection API-Key ${KEY}`)

    expect(attempt.outcome).toBe('rejected')
    expect(attempt.authCollection).toBeUndefined()
    expect(attempt.authScheme).toBe('API-Key')
  })

  it('names no collection for a scheme that is not the API-key format', () => {
    const attempt = classify(`Bearer ${KEY}`)

    expect(attempt.outcome).toBe('rejected')
    expect(attempt.authCollection).toBeUndefined()
    expect(attempt.authScheme).toBe('Bearer')
  })

  it('refuses to echo an unrecognised scheme word, which may be the credential itself', () => {
    // A two-token header whose first word is not a known scheme: reporting it
    // verbatim is how key material leaks out through the "scheme" field.
    expect(classify(`${KEY} something`).authScheme).toBe('unknown')
    expect(classify(KEY).authScheme).toBeUndefined()
  })

  it('never returns the credential or any substring of it', () => {
    const serialised = JSON.stringify([
      classify(`clients API-Key ${KEY}`),
      classify(`Bearer ${KEY}`),
      classify(KEY),
      classify(`${KEY} extra`),
    ])

    expect(serialised).not.toContain(KEY)
    // The head and tail are what a naive truncation ("last 4 characters") leaks.
    expect(serialised).not.toContain(KEY.slice(0, 8))
    expect(serialised).not.toContain(KEY.slice(-12))
  })

  it('tolerates a malformed API-key header without treating the key as a slug', () => {
    // `<slug> API-Key` with nothing after it: there is no key, so the trailing
    // word is the credential and the slug must not be reported as one.
    const attempt = classify('clients API-Key')

    expect(attempt.outcome).toBe('rejected')
    expect(attempt.authCollection).toBeUndefined()
  })
})

describe('credentialFingerprint', () => {
  it('is stable, so one broken integration stays one signal', () => {
    expect(credentialFingerprint(KEY)).toBe(credentialFingerprint(KEY))
  })

  it('separates two different credentials', () => {
    expect(credentialFingerprint(KEY)).not.toBe(credentialFingerprint(`${KEY}1`))
  })

  it('is 12 hex characters of SHA-256, not the credential', () => {
    expect(credentialFingerprint(KEY)).toMatch(/^[0-9a-f]{12}$/)
    expect(credentialFingerprint(KEY)).not.toContain(KEY.slice(0, 8))
  })
})
