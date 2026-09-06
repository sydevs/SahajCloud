import type { RenderResult } from '../../src/lib/embedVerification/browserRendering'

import { describe, expect, it } from 'vitest'

import { classifyRenderError } from '../../src/lib/embedVerification/browserRendering'
import { parseReadinessMarker, READY_ATTR } from '../../src/lib/embedVerification/readinessMarker'
import { resultFromRender, verifyEmbed } from '../../src/lib/embedVerification/verifyEmbed'

const MOUNT = 'https://sahajayoga.nl/locatelessons/'

const pageWith = (attrValue: string) =>
  `<!doctype html><html lang="nl" ${READY_ATTR}="${attrValue}"><body>…</body></html>`

// The contract published by sydevs/SahajAtlasWeb (src/lib/readiness.ts).
const MARKER = '{&quot;v&quot;:2,&quot;routing&quot;:&quot;query&quot;,&quot;topLevel&quot;:true,&quot;urlWritable&quot;:true}'

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
      message: 'A timeout was reached. Check gotoOptions/waitForSelector/waitForTimeout/actionTimeout options.',
      detail: 'Waiting for selector `[data-sahaj-atlas-ready]` failed: Waiting failed: 8000ms exceeded',
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
