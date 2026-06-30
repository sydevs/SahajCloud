import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

// Deep import (not the plugin barrel) keeps this in the unit lane — the barrel
// pulls in hooks → db → pg pool, which the unit lane must not bootstrap.
import {
  extractRequestHost,
  isHostAllowed,
  normalizeHost,
  parseAllowedDomains,
} from '@/plugins/usage/originEnforcement'

describe('normalizeHost', () => {
  it('strips scheme, userinfo, port, path and lowercases', () => {
    expect(normalizeHost('https://user@WWW.Example.org:8080/widget?x=1')).toBe('www.example.org')
  })

  it('accepts a bare host', () => {
    expect(normalizeHost('Example.ORG')).toBe('example.org')
  })

  it('preserves a leading wildcard label', () => {
    expect(normalizeHost('*.example.org')).toBe('*.example.org')
    expect(normalizeHost('HTTPS://*.Example.org/')).toBe('*.example.org')
    expect(normalizeHost('*.example.org:443')).toBe('*.example.org')
  })

  it('drops a trailing dot (FQDN form)', () => {
    expect(normalizeHost('example.org.')).toBe('example.org')
  })

  it('returns null for empty / whitespace / junk', () => {
    expect(normalizeHost('')).toBeNull()
    expect(normalizeHost('   ')).toBeNull()
    expect(normalizeHost(null)).toBeNull()
    expect(normalizeHost(undefined)).toBeNull()
    expect(normalizeHost('*')).toBeNull()
  })

  it('converts IDN to punycode identically for the URL and bare-host forms', () => {
    // The request side (browser Origin) arrives already punycoded; normalizing the
    // config side the same way means they compare equal — and a lookalike ASCII
    // host does NOT (no homograph bypass).
    expect(normalizeHost('https://MÜNCHEN.de')).toBe(normalizeHost('münchen.de'))
    expect(normalizeHost('münchen.de')).not.toBe(normalizeHost('munchen.de'))
  })

  it('normalizes IPv6 hosts in brackets, dropping the port', () => {
    expect(normalizeHost('[::1]')).toBe('[::1]')
    expect(normalizeHost('http://[::1]:8080/path')).toBe('[::1]')
  })

  it('returns null for a malformed URL the parser rejects', () => {
    expect(normalizeHost('https://[incomplete')).toBeNull()
  })
})

describe('parseAllowedDomains', () => {
  it('splits on newlines and normalizes each entry', () => {
    expect(parseAllowedDomains('https://a.org\nb.org\n  *.c.org  ')).toEqual([
      'a.org',
      'b.org',
      '*.c.org',
    ])
  })

  it('tolerates comma separators, CRLF, and blank lines', () => {
    expect(parseAllowedDomains('a.org,,\r\n , b.org\n')).toEqual(['a.org', 'b.org'])
  })

  it('returns [] for empty / null / undefined', () => {
    expect(parseAllowedDomains('')).toEqual([])
    expect(parseAllowedDomains(null)).toEqual([])
    expect(parseAllowedDomains(undefined)).toEqual([])
  })
})

describe('isHostAllowed', () => {
  it('matches an exact host only', () => {
    expect(isHostAllowed('example.org', ['example.org'])).toBe(true)
    expect(isHostAllowed('www.example.org', ['example.org'])).toBe(false)
  })

  it('wildcard matches subdomains but not the apex', () => {
    expect(isHostAllowed('a.example.org', ['*.example.org'])).toBe(true)
    expect(isHostAllowed('a.b.example.org', ['*.example.org'])).toBe(true)
    expect(isHostAllowed('example.org', ['*.example.org'])).toBe(false)
  })

  it('wildcard does not allow suffix injection', () => {
    expect(isHostAllowed('evil-example.org', ['*.example.org'])).toBe(false)
    expect(isHostAllowed('notexample.org', ['*.example.org'])).toBe(false)
    expect(isHostAllowed('example.org.evil.com', ['*.example.org'])).toBe(false)
  })

  it('matches against any entry in the list', () => {
    expect(isHostAllowed('b.org', ['a.org', 'b.org', '*.c.org'])).toBe(true)
    expect(isHostAllowed('sub.c.org', ['a.org', 'b.org', '*.c.org'])).toBe(true)
    expect(isHostAllowed('d.org', ['a.org', 'b.org', '*.c.org'])).toBe(false)
  })

  it('is false for a null host or an empty pattern list', () => {
    expect(isHostAllowed(null, ['example.org'])).toBe(false)
    expect(isHostAllowed('example.org', [])).toBe(false)
  })

  it('does not let an IDN lookalike match its ASCII allowlist entry', () => {
    const requestHost = normalizeHost('münchen.de') // xn--… punycode
    expect(requestHost).not.toBeNull()
    expect(isHostAllowed(requestHost, ['munchen.de'])).toBe(false)
    expect(isHostAllowed(requestHost, [normalizeHost('münchen.de')!])).toBe(true)
  })
})

describe('extractRequestHost', () => {
  const reqWith = (headers: Record<string, string>): PayloadRequest =>
    ({ headers: new Headers(headers) }) as unknown as PayloadRequest

  it('prefers the Origin header', () => {
    expect(
      extractRequestHost(reqWith({ origin: 'https://a.org', referer: 'https://b.org/x' })),
    ).toBe('a.org')
  })

  it('falls back to the Referer host when Origin is absent', () => {
    expect(extractRequestHost(reqWith({ referer: 'https://b.org/page?q=1' }))).toBe('b.org')
  })

  it('treats an opaque "null" Origin (any case) as absent and falls back to Referer', () => {
    expect(extractRequestHost(reqWith({ origin: 'null', referer: 'https://b.org/x' }))).toBe(
      'b.org',
    )
    expect(extractRequestHost(reqWith({ origin: 'NULL', referer: 'https://b.org/x' }))).toBe(
      'b.org',
    )
  })

  it('falls back to Referer when the Origin is malformed', () => {
    expect(
      extractRequestHost(reqWith({ origin: 'https://[incomplete', referer: 'https://b.org/x' })),
    ).toBe('b.org')
  })

  it('returns null when neither Origin nor Referer is present', () => {
    expect(extractRequestHost(reqWith({}))).toBeNull()
  })
})
