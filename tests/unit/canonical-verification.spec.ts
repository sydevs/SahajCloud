import type { EmbedMetadata, EmbedMountRecord } from '../../src/lib/clients/embedMetadata'
import type { CanonicalVerification, VerifiedEmbed } from '../../src/lib/clients/verification'

import { describe, expect, it } from 'vitest'

import {
  ATLAS_DEFAULT_COLORS,
  effectiveColor,
  isBrandColor,
} from '../../src/lib/clients/appearance'
import {
  normalizeMountPath,
  primaryPageUrl,
  reportedMountsFor,
  supportsClassAddresses,
} from '../../src/lib/clients/site'
import {
  CANONICAL_FAILURE_LIMIT,
  MAX_VERIFICATION_ATTEMPTS,
  nextVerificationState,
  splitMountKey,
} from '../../src/lib/clients/verification'

/**
 * The canonical page and how it is verified: the service's primary page
 * (`Clients.site`), the verification ladder (#633), and the mount-key split every
 * reader of `embedMetadata` and `verification.verified` parses with.
 */

const now = new Date('2026-08-18T12:00:00.000Z')

const verified: VerifiedEmbed = {
  domain: 'sahajayoga.nl',
  mount: '/locatelessons/',
  widgetVersion: 2,
  at: '2026-08-17T03:00:00.000Z',
}

describe('nextVerificationState', () => {
  const failed = { status: 'failed', reason: 'marker-absent' } as const
  const ok = { status: 'verified', embed: verified } as const

  it('records the snapshot and clears the counter on success', () => {
    const t = nextVerificationState({
      current: { verified: null, failureCount: 2, attempts: [] },
      result: ok,
      now,
    })
    expect(t.verification.verified).toEqual(verified)
    expect(t.verification.failureCount).toBe(0)
    expect(t.disable).toBe(false)
  })

  it('ends a release on success, so the open item goes with it (#1055)', () => {
    const t = nextVerificationState({
      current: { verified, failureCount: 3, attempts: [], releasedAt: '2026-11-01T03:00:00.000Z' },
      result: ok,
      now,
    })
    expect(t.verification).not.toHaveProperty('releasedAt')
    expect(t.verification.failureCount).toBe(0)
  })

  it('releases only a service that held its region', () => {
    const third = { verified, failureCount: 2, attempts: [] }
    const owner = nextVerificationState({ current: third, result: failed, now, owned: true })
    expect(owner).toMatchObject({ disable: true, released: true })
    expect(owner.verification.releasedAt).toBe(now.toISOString())

    const other = nextVerificationState({ current: third, result: failed, now, owned: false })
    expect(other).toMatchObject({ disable: true, released: false })
    expect(other.verification).not.toHaveProperty('releasedAt')
  })

  it('keeps a release through further failures', () => {
    const releasedAt = '2026-11-01T03:00:00.000Z'
    const t = nextVerificationState({
      current: { verified, failureCount: 3, attempts: [], releasedAt },
      result: failed,
      now,
    })
    expect(t.verification.releasedAt).toBe(releasedAt)
  })

  it('counts no strike for a press of Check, however many fail', () => {
    let state: CanonicalVerification = { verified, failureCount: 1, attempts: [] }
    for (let i = 0; i < CANONICAL_FAILURE_LIMIT + 1; i++) {
      const t = nextVerificationState({ current: state, result: failed, now, countsStrikes: false })
      expect(t.disable).toBe(false)
      state = t.verification
    }
    expect(state.failureCount).toBe(1)
    expect(state.verified).toEqual(verified)
    expect(state.attempts).toHaveLength(CANONICAL_FAILURE_LIMIT + 1)
  })

  it('disables on the third consecutive failure and not the second', () => {
    let state: CanonicalVerification = { verified, failureCount: 0, attempts: [] }
    const disables: boolean[] = []

    for (let i = 0; i < CANONICAL_FAILURE_LIMIT; i++) {
      const t = nextVerificationState({ current: state, result: failed, now })
      state = t.verification
      disables.push(t.disable)
    }

    expect(disables).toEqual([false, false, true])
    expect(state.failureCount).toBe(3)
  })

  // The load-bearing exemption: our integration breaking is not their embed
  // breaking, and counting it would auto-disable working canonicals.
  it('never counts an inconclusive run toward the failure budget', () => {
    const current: CanonicalVerification = { verified, failureCount: 2, attempts: [] }
    const t = nextVerificationState({
      current,
      result: { status: 'inconclusive', reason: 'provider-error' },
      now,
    })

    expect(t.verification.failureCount).toBe(2)
    expect(t.disable).toBe(false)
    expect(t.verification.verified).toEqual(verified)
    // Retried sooner than a normal cycle — the fault is likely ours and transient.
    expect(Date.parse(t.nextVerifyAt) - now.getTime()).toBeLessThan(24 * 60 * 60 * 1000)
  })

  it('keeps the last good snapshot through failures, so the panel can say what broke', () => {
    const t = nextVerificationState({
      current: { verified, failureCount: 0, attempts: [] },
      result: failed,
      now,
    })
    expect(t.verification.verified).toEqual(verified)
  })

  it('bounds the attempt log', () => {
    let state: CanonicalVerification = { verified: null, failureCount: 0, attempts: [] }
    for (let i = 0; i < MAX_VERIFICATION_ATTEMPTS + 5; i++) {
      state = nextVerificationState({ current: state, result: failed, now }).verification
    }
    expect(state.attempts).toHaveLength(MAX_VERIFICATION_ATTEMPTS)
  })

  it('backs off further the longer a site stays broken', () => {
    const first = nextVerificationState({
      current: { verified: null, failureCount: 0, attempts: [] },
      result: failed,
      now,
    })
    const later = nextVerificationState({
      current: { verified: null, failureCount: 4, attempts: [] },
      result: failed,
      now,
    })
    expect(Date.parse(later.nextVerifyAt)).toBeGreaterThan(Date.parse(first.nextVerifyAt))
  })
})

describe('splitMountKey', () => {
  it('splits a plain mount', () => {
    expect(splitMountKey('https://sahajayoga.nl/locatelessons/')).toEqual({
      domain: 'sahajayoga.nl',
      mount: '/locatelessons/',
    })
  })

  it('keeps a WordPress permalink in the mount', () => {
    expect(splitMountKey('https://sahajayoga.nl/?p=123')).toEqual({
      domain: 'sahajayoga.nl',
      mount: '/?p=123',
    })
  })

  it('returns null for something that is not a URL', () => {
    expect(splitMountKey('not a url')).toBeNull()
  })
})

/**
 * Where a service's atlas lives (`Clients.site`): the one page every check,
 * claim and canonical URL is about. `siteHosts` is pinned beside the origin
 * check it feeds, in `origin-enforcement.spec.ts`.
 */

const record = (overrides: Partial<EmbedMountRecord> = {}): EmbedMountRecord => ({
  mode: 'inline',
  topLevel: true,
  urlWritable: true,
  paramPersisted: true,
  routing: 'path',
  lastSeen: '2026-10-01T00:00:00.000Z',
  ...overrides,
})

describe('primaryPageUrl', () => {
  it('is https on the bare domain, whatever was stored', () => {
    expect(primaryPageUrl({ domain: 'sahajayoga.ca', page: '/classes' })).toBe(
      'https://sahajayoga.ca/classes',
    )
    expect(primaryPageUrl({ domain: 'sahajayoga.ca', page: '/?p=42' })).toBe(
      'https://sahajayoga.ca/?p=42',
    )
  })

  it('is null until both halves are set, and for a page that is not a path', () => {
    expect(primaryPageUrl({ domain: 'sahajayoga.ca', page: null })).toBeNull()
    expect(primaryPageUrl({ domain: null, page: '/classes' })).toBeNull()
    expect(primaryPageUrl({ domain: 'sahajayoga.ca', page: 'classes' })).toBeNull()
    expect(primaryPageUrl(null)).toBeNull()
  })
})

describe('normalizeMountPath', () => {
  it('compares two spellings of one page as one', () => {
    expect(normalizeMountPath('/classes/')).toBe('/classes')
    expect(normalizeMountPath('//classes')).toBe('/classes')
    expect(normalizeMountPath('/')).toBe('/')
    expect(normalizeMountPath('/?p=42')).toBe('/?p=42')
  })
})

describe('reportedMountsFor on a service with a domain', () => {
  const site = { domain: 'sahajayoga.ca', page: '/classes' }

  it('finds the report from the primary page, on the domain or its www twin', () => {
    const embedMetadata: EmbedMetadata = {
      'https://www.sahajayoga.ca/classes/': record(),
    }
    expect(reportedMountsFor(embedMetadata, site)[0]?.key).toBe(
      'https://www.sahajayoga.ca/classes/',
    )
  })

  it('takes the most recent of several, which is the live one', () => {
    const embedMetadata: EmbedMetadata = {
      'https://sahajayoga.ca/classes': record({ lastSeen: '2026-09-01T00:00:00.000Z' }),
      'https://www.sahajayoga.ca/classes': record({ lastSeen: '2026-10-01T00:00:00.000Z' }),
    }
    expect(reportedMountsFor(embedMetadata, site)[0]?.key).toBe('https://www.sahajayoga.ca/classes')
  })

  it('ignores another page on the site, and the same page on another site', () => {
    const embedMetadata: EmbedMetadata = {
      'https://sahajayoga.ca/': record(),
      'https://evil.example/classes': record(),
    }
    expect(reportedMountsFor(embedMetadata, site)).toEqual([])
  })

  it('answers nothing with no page or no reports', () => {
    const embedMetadata: EmbedMetadata = { 'https://sahajayoga.ca/classes': record() }
    expect(reportedMountsFor(embedMetadata, { domain: 'sahajayoga.ca', page: null })).toEqual([])
    expect(reportedMountsFor(null, site)).toEqual([])
  })
})

describe('supportsClassAddresses', () => {
  it('is true only for a widget in the page itself that can write its address', () => {
    expect(supportsClassAddresses(record())).toBe(true)
    // A `?atlas=` link is still a class address: the reload test is not the rule.
    expect(supportsClassAddresses(record({ routing: 'query', paramPersisted: false }))).toBe(true)
    expect(supportsClassAddresses(record({ mode: 'iframe' }))).toBe(false)
    expect(supportsClassAddresses(record({ urlWritable: false }))).toBe(false)
  })
})

describe('isBrandColor and effectiveColor', () => {
  it('reads only the unconfigured black as unset, as the widget does', () => {
    for (const value of ['#000000', '#000', null, undefined, '', 'teal']) {
      expect(isBrandColor(value)).toBe(false)
    }
    // A grey or a white is somebody's choice, and the widget paints it.
    for (const value of ['#7B4EA8', '#f60', '#FFFFFF', '#808080', '#fffdfa']) {
      expect(isBrandColor(value)).toBe(true)
    }
  })

  it('paints the default for an unset column and the service’s own otherwise', () => {
    expect(effectiveColor('color1', '#000000')).toBe(ATLAS_DEFAULT_COLORS.color1)
    expect(effectiveColor('color3', null)).toBe(ATLAS_DEFAULT_COLORS.color3)
    expect(effectiveColor('color2', '#7B4EA8')).toBe('#7B4EA8')
  })
})
