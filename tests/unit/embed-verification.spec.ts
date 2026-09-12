import type {
  CanonicalVerification,
  PathProbeResult,
  VerificationResult,
} from '../../src/lib/clients/verification'
import type { RenderResult } from '../../src/lib/embedVerification/browserRendering'

import { describe, expect, it } from 'vitest'

import { buildCanonicalUrl, canonicalTargetForHost } from '../../src/lib/atlas/canonicalUrl'
import {
  effectiveRouting,
  EMPTY_VERIFICATION,
  nextPathProbeState,
  nextVerificationState,
  PATH_PROBE_FAILURE_LIMIT,
  splitMountKey,
} from '../../src/lib/clients/verification'
import { classifyRenderError } from '../../src/lib/embedVerification/browserRendering'
import { parseReadinessMarker, READY_ATTR } from '../../src/lib/embedVerification/readinessMarker'
import {
  pathProbeUrls,
  probePathRouting,
  resultFromRender,
  verifyEmbed,
} from '../../src/lib/embedVerification/verifyEmbed'

const MOUNT = 'https://sahajayoga.nl/locatelessons/'

const pageWith = (attrValue: string) =>
  `<!doctype html><html lang="nl" ${READY_ATTR}="${attrValue}"><body>…</body></html>`

// The contract published by sydevs/SahajAtlasWeb (src/lib/readiness.ts).
const MARKER =
  '{&quot;v&quot;:2,&quot;routing&quot;:&quot;query&quot;,&quot;topLevel&quot;:true,&quot;urlWritable&quot;:true}'

describe('parseReadinessMarker', () => {
  it('reads the marker the widget publishes', () => {
    expect(parseReadinessMarker(pageWith(MARKER))).toEqual({
      v: 2,
      routing: 'query',
      topLevel: true,
      urlWritable: true,
    })
  })

  it('reads an unescaped single-quoted attribute too', () => {
    const html = `<html ${READY_ATTR}='{"v":3,"routing":"path","topLevel":false,"urlWritable":false}'>`
    expect(parseReadinessMarker(html)).toEqual({
      v: 3,
      routing: 'path',
      topLevel: false,
      urlWritable: false,
    })
  })

  it('returns null when the page has no marker', () => {
    expect(parseReadinessMarker('<!doctype html><html><body>nothing</body></html>')).toBeNull()
  })

  // A marker we cannot parse tells us nothing about whether the widget booted. Treating it as
  // success would let a broken deploy verify itself.
  it.each([
    ['not json', 'oops'],
    ['an unknown routing mode', '{&quot;v&quot;:2,&quot;routing&quot;:&quot;hash&quot;}'],
    ['no routing at all', '{&quot;v&quot;:2,&quot;topLevel&quot;:true}'],
  ])('returns null for %s', (_label, value) => {
    expect(parseReadinessMarker(pageWith(value))).toBeNull()
  })

  it('ignores a marker that is not on the <html> tag', () => {
    const html = `<!doctype html><html><body><div ${READY_ATTR}="${MARKER}"></div></body></html>`
    expect(parseReadinessMarker(html)).toBeNull()
  })
})

describe('classifyRenderError', () => {
  /**
   * Captured live from Cloudflare Browser Rendering on 2026-08-19 — not invented.
   * These are the exact payloads the API returns, so the classifier is checked
   * against what it will actually meet rather than against my guess at it.
   */
  const LIVE = {
    selectorTimeout: {
      code: 6002,
      message:
        'A timeout was reached. Check gotoOptions/waitForSelector/waitForTimeout/actionTimeout options.',
      detail:
        'Waiting for selector `[data-sahaj-atlas-ready]` failed: Waiting failed: 8000ms exceeded',
    },
    deadDomain: {
      code: 5006,
      message: 'Network connection closed.',
      detail: 'Can also happen due to failure to resolve DNS.',
    },
    badToken: { code: 10000, message: 'Authentication error', detail: undefined },
  }

  it('reads a selector timeout as the marker never appearing', () => {
    expect(classifyRenderError(LIVE.selectorTimeout.message, LIVE.selectorTimeout.code)).toBe(
      'selector-timeout',
    )
  })

  it('reads a dead domain as a navigation failure', () => {
    expect(classifyRenderError(LIVE.deadDomain.message, LIVE.deadDomain.code)).toBe('navigation')
  })

  // Our credentials lapsing says nothing about their embed. If this ever
  // classified as a failure, every canonical would disable itself in three days.
  it('reads an auth error as our own fault', () => {
    expect(classifyRenderError(LIVE.badToken.message, LIVE.badToken.code)).toBe('provider')
  })

  it('falls back to the message for a code it has not met', () => {
    expect(classifyRenderError('Daily quota exceeded for Browser Rendering')).toBe('quota')
    expect(classifyRenderError('net::ERR_NAME_NOT_RESOLVED')).toBe('navigation')
    expect(classifyRenderError('Timeout 15000ms exceeded waiting for selector')).toBe(
      'selector-timeout',
    )
  })

  // The bias that matters: anything unrecognised is *our* fault, never theirs,
  // because the alternative is auto-disabling a working canonical.
  it('treats an unrecognised message as a provider fault', () => {
    expect(classifyRenderError('something nobody anticipated')).toBe('provider')
  })

  // "quota exceeded" matches the timeout pattern too. Quota has to win, or
  // exhausting our own allowance would be recorded as their embed failing.
  it('prefers quota over timeout when a message matches both', () => {
    expect(classifyRenderError('Daily quota exceeded')).toBe('quota')
  })
})

describe('verifyEmbed scheme guard', () => {
  // `canonical.embed` is a plain text field an admin can type into, and this is where a
  // string turns into an outbound page load. Non-http schemes must never reach the renderer.
  it.each(['data:text/html,<html>', 'file:///etc/passwd', 'javascript:alert(1)', 'not-a-url'])(
    'refuses %s without rendering anything',
    async (mount) => {
      let called = false
      const result = await verifyEmbed(mount, {
        fetchFn: (() => {
          called = true
          throw new Error('should not be reached')
        }) as unknown as typeof fetch,
      })
      expect(called).toBe(false)
      expect(result).toMatchObject({ status: 'failed', reason: 'http' })
    },
  )
})

describe('resultFromRender', () => {
  it('verifies from the rendered marker, taking routing from the page', () => {
    const result = resultFromRender(MOUNT, { ok: true, html: pageWith(MARKER) })
    expect(result.status).toBe('verified')
    expect(result.status === 'verified' && result.embed).toMatchObject({
      domain: 'sahajayoga.nl',
      mount: '/locatelessons/',
      routing: 'query',
      widgetVersion: 2,
    })
  })

  it('keeps a WordPress permalink in the verified mount', () => {
    const result = resultFromRender('https://site.example/?p=123', {
      ok: true,
      html: pageWith(MARKER),
    })
    expect(result.status === 'verified' && result.embed.mount).toBe('/?p=123')
  })

  it('fails when the page rendered but carried no marker', () => {
    const result = resultFromRender(MOUNT, { ok: true, html: '<html><body>nope</body></html>' })
    expect(result).toMatchObject({ status: 'failed', reason: 'marker-absent' })
  })

  // The split the whole design rests on: these two must not be confusable.
  it.each<[RenderResult, 'failed' | 'inconclusive']>([
    [{ ok: false, kind: 'navigation', detail: 'x' }, 'failed'],
    [{ ok: false, kind: 'selector-timeout', detail: 'x' }, 'failed'],
    [{ ok: false, kind: 'provider', detail: 'x' }, 'inconclusive'],
    [{ ok: false, kind: 'quota', detail: 'x' }, 'inconclusive'],
    [{ ok: false, kind: 'unconfigured', detail: 'x' }, 'inconclusive'],
  ])('maps %o to %s', (render, expected) => {
    expect(resultFromRender(MOUNT, render).status).toBe(expected)
  })
})

// ── The path-routing probe (#644) ───────────────────────────────────────────

const TOKEN = 'sahaj-atlas-probe-deadbeef'
const PROBE_URL = `${MOUNT}${TOKEN}`
const CONTROL_URL = `https://sahajayoga.nl/${TOKEN}`

const marked: RenderResult = { ok: true, html: pageWith(MARKER) }
const blank: RenderResult = { ok: true, html: '<html><body>404</body></html>' }

/** A render function answering each URL from a map, recording what it was asked. */
const renderer = (answers: Record<string, RenderResult>) => {
  const seen: string[] = []
  return {
    seen,
    render: async (url: string) => {
      seen.push(url)
      return answers[url] ?? blank
    },
  }
}

describe('pathProbeUrls', () => {
  it('derives both URLs from the mount key, and from nothing else', () => {
    expect(pathProbeUrls(MOUNT, TOKEN)).toEqual({ probe: PROBE_URL, control: CONTROL_URL })
  })

  it('keeps a root mount from emitting a doubled slash', () => {
    expect(pathProbeUrls('https://example.org/', TOKEN)?.probe).toBe(`https://example.org/${TOKEN}`)
  })

  // `canonicalUrlBase` already refuses path routing for a mount carrying a
  // query, so spending a render to learn the same thing would be waste.
  it('refuses a WordPress permalink mount, which cannot path-route at all', () => {
    expect(pathProbeUrls('https://site.example/?p=123', TOKEN)).toBeNull()
  })

  it.each(['data:text/html,<html>', 'file:///etc/passwd', 'not-a-url'])('refuses %s', (mount) => {
    expect(pathProbeUrls(mount, TOKEN)).toBeNull()
  })

  /**
   * A promotion is only sound if the page we probed is the page we will
   * publish. The probe derives its URL from the mount key and the builder
   * derives the canonical from the stored host — two paths to the same string,
   * so pin them together rather than trusting the comment that says they agree.
   */
  it('probes the URL a promoted client would publish', () => {
    const split = splitMountKey(MOUNT)!
    const target = canonicalTargetForHost(split, 'path')!
    expect(pathProbeUrls(MOUNT, TOKEN)?.probe).toBe(buildCanonicalUrl(target, `/${TOKEN}`))
  })
})

describe('probePathRouting', () => {
  const probe = (answers: Record<string, RenderResult>) => {
    const { render, seen } = renderer(answers)
    return { result: probePathRouting(MOUNT, { token: () => TOKEN, render }), seen }
  }

  it('is positive when the prefixed path carries the marker and the origin root does not', async () => {
    const { result, seen } = probe({ [PROBE_URL]: marked })
    await expect(result).resolves.toEqual({ status: 'positive' })
    expect(seen).toEqual([PROBE_URL, CONTROL_URL])
  })

  // The control is what a host mounting the widget on its own 404 page fails:
  // every unknown path answers with a running widget, which looks exactly like
  // a working rewrite until you ask for one outside the mount.
  it('refuses to promote when the control render carries the marker too', async () => {
    const { result } = probe({ [PROBE_URL]: marked, [CONTROL_URL]: marked })
    await expect(result).resolves.toMatchObject({ status: 'negative' })
  })

  it('is negative when the prefixed path has no marker', async () => {
    const { result, seen } = probe({})
    await expect(result).resolves.toMatchObject({ status: 'negative' })
    // The control render is spent here too, where it used to be skipped. That
    // is what buys the overlap below, and #644 budgets three renders an owner.
    expect(seen).toEqual([PROBE_URL, CONTROL_URL])
  })

  /**
   * The latency property, not a verdict property — and the reason the verdict
   * logic above is worth re-reading rather than rewriting.
   *
   * Sequentially the promote path ran mount, probe and control end to end at
   * 45s each (`browserRendering.ts`), and Cloudflare abandons an origin
   * response at 100s — so "Verify now" answered a 524 on the very press that
   * promoted the service, after the row was already written. Overlapping the
   * two probe renders puts the worst case under that ceiling.
   */
  it('starts both probe renders before either resolves', async () => {
    let inFlight = 0
    let peak = 0
    const result = await probePathRouting(MOUNT, {
      token: () => TOKEN,
      render: async (url) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight--
        return url === PROBE_URL ? marked : blank
      },
    })
    expect(peak).toBe(2)
    expect(result).toEqual({ status: 'positive' })
  })

  // The same split the mount verifier rests on: their server, or our sight.
  it.each<[Extract<RenderResult, { ok: false }>, string]>([
    [{ ok: false, kind: 'navigation', detail: 'x' }, 'negative'],
    [{ ok: false, kind: 'selector-timeout', detail: 'x' }, 'negative'],
    [{ ok: false, kind: 'provider', detail: 'x' }, 'inconclusive'],
    [{ ok: false, kind: 'quota', detail: 'x' }, 'inconclusive'],
    [{ ok: false, kind: 'unconfigured', detail: 'x' }, 'inconclusive'],
  ])('maps a %o probe render to %s', async (render, expected) => {
    const { result } = probe({ [PROBE_URL]: render })
    expect((await result).status).toBe(expected)
  })

  // A control we could not render leaves the promotion unproven, not proven.
  it('stays inconclusive when the control render tells us nothing', async () => {
    const { result } = probe({
      [PROBE_URL]: marked,
      [CONTROL_URL]: { ok: false, kind: 'quota', detail: 'x' },
    })
    await expect(result).resolves.toMatchObject({ status: 'inconclusive' })
  })

  it('never sends a browser at a URL that is not derived from the mount', async () => {
    let called = false
    const result = await probePathRouting('javascript:alert(1)', {
      render: async () => {
        called = true
        return marked
      },
    })
    expect(called).toBe(false)
    expect(result.status).toBe('negative')
  })
})

describe('the path-probe ladder', () => {
  const now = new Date('2026-09-12T03:00:00.000Z')
  const fold = (
    current: CanonicalVerification | null,
    status: PathProbeResult['status'],
  ): CanonicalVerification => nextPathProbeState({ current, result: { status }, now })

  it('promotes on a single positive', () => {
    const next = fold(null, 'positive')
    expect(next.pathProbe).toEqual({ at: now.toISOString(), verdict: 'path', failedAttempts: 0 })
    expect(effectiveRouting(next)).toBe('path')
  })

  it('demotes on the third consecutive negative, not the first or the second', () => {
    let state = fold(null, 'positive')
    state = fold(state, 'negative')
    expect(effectiveRouting(state)).toBe('path')
    state = fold(state, 'negative')
    expect(effectiveRouting(state)).toBe('path')

    state = fold(state, 'negative')
    expect(effectiveRouting(state)).toBe('query')
    expect(state.pathProbe?.failedAttempts).toBe(PATH_PROBE_FAILURE_LIMIT)
  })

  it('resets the strike count on the next positive', () => {
    const demoted = fold(fold(fold(fold(null, 'positive'), 'negative'), 'negative'), 'negative')
    expect(fold(demoted, 'positive').pathProbe).toMatchObject({
      verdict: 'path',
      failedAttempts: 0,
    })
  })

  it('changes nothing at all on an inconclusive probe', () => {
    const state = fold(fold(null, 'positive'), 'negative')
    expect(fold(state, 'inconclusive')).toEqual(state)
  })

  // The two counters must not be confusable: `failureCount` is what becomes
  // `disable`, which switches canonical ownership off and emails a manager.
  it('moves independently of failureCount', () => {
    const failed: VerificationResult = { status: 'failed', reason: 'marker-absent' }
    let state = fold(null, 'positive')
    for (let i = 0; i < 3; i++) {
      state = nextVerificationState({ current: state, result: failed, now }).verification
    }
    expect(state.failureCount).toBe(3)
    expect(state.pathProbe).toMatchObject({ verdict: 'path', failedAttempts: 0 })

    const probed = fold(state, 'negative')
    expect(probed.failureCount).toBe(3)
    expect(probed.pathProbe?.failedAttempts).toBe(1)
  })

  // A success rebuilds the object, and the verdict is a sibling it does not own.
  it('survives a successful mount verification', () => {
    const verified = nextVerificationState({
      current: fold(null, 'positive'),
      result: {
        status: 'verified',
        embed: {
          domain: 'sahajayoga.nl',
          mount: '/locatelessons/',
          routing: 'query',
          widgetVersion: 2,
          at: now.toISOString(),
        },
      },
      now,
    }).verification
    expect(effectiveRouting(verified)).toBe('path')
  })
})

describe('effectiveRouting', () => {
  it('defaults to query with nothing observed', () => {
    expect(effectiveRouting(null)).toBe('query')
    expect(effectiveRouting(EMPTY_VERIFICATION)).toBe('query')
  })

  // Why the verdict sits beside `verified` rather than inside it: the widget
  // should path-route as soon as the host serves the subtree, whether or not
  // the mount verification has ever succeeded.
  it('answers path for a client whose mount has never verified', () => {
    const state = nextPathProbeState({
      current: EMPTY_VERIFICATION,
      result: { status: 'positive' },
      now: new Date('2026-09-12T03:00:00.000Z'),
    })
    expect(state.verified).toBeNull()
    expect(effectiveRouting(state)).toBe('path')
  })
})
