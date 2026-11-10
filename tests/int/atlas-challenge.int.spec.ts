import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { atlasChallenge } from '@/endpoints/atlas/challenge'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * `GET /api/atlas/challenge` against real `clients` rows: which parents the stored allowlists
 * admit, and what the response carries. The page's own browser behaviour is
 * `tests/unit/atlas-challenge.spec.ts`; this is the read and the verdict.
 */
describe('atlasChallenge endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  const call = async (query: Record<string, string>) => {
    const req = { payload, query, headers: new Headers(), routeParams: {}, context: {} }
    const response = (await atlasChallenge.handler(req as unknown as PayloadRequest)) as Response
    return { status: response.status, headers: response.headers, html: await response.text() }
  }

  /** The JSON config the page was rendered with, read back out of its one inline script. */
  const configOf = (html: string): Record<string, unknown> =>
    JSON.parse(/\}\)\((\{.*\})\);<\/script>/.exec(html)?.[1] ?? 'null') as Record<string, unknown>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, { name: 'Challenge Manager' })
    await testData.createClient(payload, manager.id, {
      label: 'Partner',
      roles: ['sahaj-atlas-client'],
      site: { domain: 'partner.org' },
    })
    // No domain: API reads from any origin, but nothing here (#1072, question 1).
    await testData.createClient(payload, manager.id, {
      label: 'Open Client',
      roles: ['sahaj-atlas-client'],
    })
    await testData.createClient(payload, manager.id, {
      label: 'Inactive Client',
      roles: ['sahaj-atlas-client'],
      site: { domain: 'draft-only.org' },
      enabled: false,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it.each(['https://partner.org', 'https://www.partner.org', 'http://localhost:5174'])(
    'renders the challenge for %s, pinned to that parent',
    async (parent) => {
      const { status, headers, html } = await call({ parent, theme: 'dark', language: 'fr' })

      expect(status).toBe(200)
      expect(headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(headers.get('cache-control')).toBe('private, max-age=300')
      expect(configOf(html)).toEqual({
        parent,
        siteKey: process.env.TURNSTILE_SITE_KEY,
        theme: 'dark',
        language: 'fr',
        probe: false,
      })
    },
  )

  it.each([
    ['a host no active client has', 'https://www.example.org'],
    ['a host only an inactive client has', 'https://draft-only.org'],
    ['another subdomain of a client’s domain', 'https://lyon.partner.org'],
    ['a parent that is not a bare origin', 'https://partner.org/page'],
  ])('refuses %s, uncached', async (_case, parent) => {
    const { status, headers, html } = await call({ parent })

    expect(status).toBe(403)
    expect(headers.get('cache-control')).toBe('no-store')
    expect(configOf(html)).toEqual({ refusal: 'origin' })
    expect(html).not.toContain(process.env.TURNSTILE_SITE_KEY)
  })

  it('refuses a request naming no parent', async () => {
    const { status, html } = await call({})

    expect(status).toBe(403)
    expect(configOf(html)).toEqual({ refusal: 'origin' })
  })

  it('carries the probe flag through', async () => {
    const { html } = await call({ parent: 'https://partner.org', probe: '1' })

    expect(configOf(html)).toMatchObject({ probe: true })
  })
})
