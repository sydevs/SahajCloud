import type { EmbedMetadata } from '../../src/lib/clients/embedMetadata'
import type { CanonicalVerification, VerifiedEmbed } from '../../src/lib/clients/verification'

import { describe, expect, it } from 'vitest'

import {
  buildPickerModel,
  cautionsFor,
  formatAge,
  splitMountKey,
} from '../../src/components/admin/CanonicalEmbedPicker/model'
import { buildCanonicalUrl, canonicalTargetForHost } from '../../src/lib/atlas/canonicalUrl'
import {
  CANONICAL_FAILURE_LIMIT,
  MAX_VERIFICATION_ATTEMPTS,
  nextVerificationState,
} from '../../src/lib/clients/verification'

const now = new Date('2026-08-18T12:00:00.000Z')

const healthy = {
  mode: 'inline' as const,
  topLevel: true,
  urlWritable: true,
  paramPersisted: true,
  routing: 'query' as const,
  lastSeen: '2026-08-18T09:00:00.000Z',
}

const verified: VerifiedEmbed = {
  domain: 'sahajayoga.nl',
  mount: '/locatelessons/',
  routing: 'query',
  widgetVersion: 2,
  at: '2026-08-17T03:00:00.000Z',
}

/**
 * The URL *shapes* are pinned against the cross-repo fixture in
 * `atlas-canonical-url.spec.ts`. What matters here is that the picker previews
 * the same URL the resolver emits — the preview exists to let an operator catch
 * a bad canonical before saving, so a preview that differs from production is
 * worse than none.
 *
 * This regressed once already: the picker had its own builder, which stripped
 * the Atlas path's leading slash and percent-encoded the rest
 * (`?atlas=events%2F12345`). The widget guards that parameter with
 * `safeLoaderPath`, which requires a leading `/` and rejects a bare
 * `relative/path`, so URLs of that shape were refused and the widget fell back
 * to the embed's default route.
 */
describe('the sample URL the picker shows', () => {
  const model = (v: VerifiedEmbed) =>
    buildPickerModel({
      embedMetadata: { [`https://${v.domain}${v.mount}`]: { ...healthy, routing: v.routing } },
      embed: `https://${v.domain}${v.mount}`,
      verification: { verified: v, failureCount: 0, attempts: [] },
      now,
    }).selected

  it('is byte-identical to what the resolver would build', () => {
    expect(model(verified)?.sampleUrl).toBe(
      buildCanonicalUrl(canonicalTargetForHost(verified), '/events/12345'),
    )
  })

  it('keeps the Atlas path slash-led and unencoded, as the widget requires', () => {
    expect(model(verified)?.sampleUrl).toBe(
      'https://sahajayoga.nl/locatelessons/?atlas=/events/12345',
    )
  })

  // A WordPress default permalink mount already carries a query, so the Atlas
  // parameter must join with `&`. Getting it wrong yields a URL that 404s.
  it('joins with `&` when the mount is a WordPress permalink', () => {
    expect(model({ ...verified, mount: '/?p=123' })?.sampleUrl).toBe(
      'https://sahajayoga.nl/?p=123&atlas=/events/12345',
    )
  })

  it('builds a path-routed sample without a query at all', () => {
    expect(model({ ...verified, routing: 'path' })?.sampleUrl).toBe(
      'https://sahajayoga.nl/locatelessons/events/12345',
    )
  })
})

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

describe('cautionsFor', () => {
  it('is silent about a healthy mount', () => {
    expect(cautionsFor(healthy)).toEqual([])
  })

  it('flags each way a mount cannot carry a canonical', () => {
    const cautions = cautionsFor({
      ...healthy,
      topLevel: false,
      urlWritable: false,
      paramPersisted: false,
    })
    expect(cautions).toHaveLength(3)
    expect(cautions.join(' ')).toContain('iframe')
  })
})

describe('formatAge', () => {
  it.each([
    ['2026-08-18T01:00:00.000Z', 'today'],
    ['2026-08-17T09:00:00.000Z', 'yesterday'],
    ['2026-08-13T12:00:00.000Z', '5 days ago'],
    ['2026-07-28T12:00:00.000Z', '3 weeks ago'],
    ['2026-05-18T12:00:00.000Z', '3 months ago'],
  ])('renders %s as %s', (iso, expected) => {
    expect(formatAge(iso, now)).toBe(expected)
  })

  it('returns null when never verified or unparseable', () => {
    expect(formatAge(null, now)).toBeNull()
    expect(formatAge('nonsense', now)).toBeNull()
  })
})

describe('buildPickerModel', () => {
  const reported: EmbedMetadata = {
    'https://sahajayoga.nl/locatelessons/': healthy,
    'https://sahajayoga.nl/map': { ...healthy, topLevel: false, mode: 'iframe' },
  }

  it('explains an empty list instead of rendering a blank select', () => {
    const model = buildPickerModel({
      embedMetadata: {},
      embed: null,
      verification: null,
      now,
    })
    expect(model.options).toEqual([])
    expect(model.emptyReason).toContain('current Sahaj Atlas widget')
  })

  it('offers every reported mount, carrying its cautions', () => {
    const model = buildPickerModel({
      embedMetadata: reported,
      embed: null,
      verification: null,
      now,
    })
    expect(model.options.map((o) => o.value)).toEqual([
      'https://sahajayoga.nl/locatelessons/',
      'https://sahajayoga.nl/map',
    ])
    expect(model.options[1].cautions).toHaveLength(1)
    expect(model.emptyReason).toBeNull()
    expect(model.selected).toBeNull()
  })

  it('marks the selection verified only when the snapshot names that same mount', () => {
    const verification: CanonicalVerification = { verified, failureCount: 0, attempts: [] }
    const model = buildPickerModel({
      embedMetadata: reported,
      embed: 'https://sahajayoga.nl/locatelessons/',
      verification,
      now,
    })
    expect(model.selected?.status).toBe('verified')
    expect(model.selected?.sampleIsProvisional).toBe(false)
    expect(model.selected?.verifiedAge).toBe('yesterday')

    // Selecting a *different* mount must not inherit the other one's verification.
    const moved = buildPickerModel({
      embedMetadata: reported,
      embed: 'https://sahajayoga.nl/map',
      verification,
      now,
    })
    expect(moved.selected?.status).not.toBe('verified')
    expect(moved.selected?.sampleIsProvisional).toBe(true)
  })

  it('still shows a selection that has stopped reporting', () => {
    const model = buildPickerModel({
      embedMetadata: reported,
      embed: 'https://sahajayoga.nl/gone',
      verification: null,
      now,
    })
    expect(model.options[0].value).toBe('https://sahajayoga.nl/gone')
    expect(model.options[0].status).toBe('missing')
    expect(model.selected?.status).toBe('missing')
  })
})
