import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { audiencesForUser } from '@/collections/Audiences/endpoints/forUser'
import type { Audience, Client } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const AUDIENCE_DEFAULTS = {
  pathProgress: 0,
  meditationsPerWeek: 0,
  totalMeditationsViewed: 0,
  totalLecturesViewed: 0,
  country: 'US',
}

const DEFAULT_CLIENT_USER = { id: 0, collection: 'clients', _status: 'published' }

async function callEndpoint(
  payload: Payload,
  query: Record<string, string | number | boolean>,
  options: {
    skipAudienceDefaults?: boolean
    user?: { id: number | string; collection: string; _status?: 'published' | 'draft' } | null
  } = {},
): Promise<{ status: number; headers: Headers; body: { audiences?: number[]; errors?: unknown } }> {
  const finalQuery = options.skipAudienceDefaults ? query : { ...AUDIENCE_DEFAULTS, ...query }
  const req = {
    payload,
    query: finalQuery,
    headers: new Headers(),
    routeParams: {},
    user: 'user' in options ? options.user : DEFAULT_CLIENT_USER,
  } as unknown as PayloadRequest

  const response = (await audiencesForUser.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, headers: response.headers, body }
}

describe('audiencesForUser endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number

  let audienceBeginner: Audience // pathProgress 0..5
  let audienceIntermediate: Audience // pathProgress 5..10
  let audienceFrequent: Audience // meditationsPerWeek >= 3
  let audienceConditionOpen: Audience // no constraints → always passes
  let audienceConditionUS: Audience // location.countries: ['US']

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUserId = env.adminUser.id

    audienceBeginner = await testData.createAudience(payload, {
      label: 'Beginner',
      pathProgress: { min: 0, max: 5 },
    })
    audienceIntermediate = await testData.createAudience(payload, {
      label: 'Intermediate',
      pathProgress: { min: 5, max: 10 },
    })
    audienceFrequent = await testData.createAudience(payload, {
      label: 'Frequent',
      meditationsPerWeek: { min: 3 },
    })

    audienceConditionOpen = await testData.createAudience(payload, {
      label: 'Open Condition',
    })
    audienceConditionUS = await testData.createAudience(payload, {
      label: 'US Condition',
      location: { countries: ['US'] },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('returns 400 when required params are missing', async () => {
    const { status, body } = await callEndpoint(payload, {}, { skipAudienceDefaults: true })
    expect(status).toBe(400)
    expect(body).toHaveProperty('errors')
  })

  describe('auth gate', () => {
    it('rejects unauthenticated callers with 403', async () => {
      const { status, body } = await callEndpoint(payload, {}, { user: null })
      expect(status).toBe(403)
      expect(body).toEqual({
        errors: [{ message: 'You are not allowed to perform this action.' }],
      })
    })

    it('rejects non-client users (managers) with 403', async () => {
      const { status } = await callEndpoint(
        payload,
        {},
        { user: { id: adminUserId, collection: 'managers' } },
      )
      expect(status).toBe(403)
    })

    it('rejects inactive clients with 403', async () => {
      const { status } = await callEndpoint(
        payload,
        {},
        { user: { id: 999, collection: 'clients', _status: 'draft' } },
      )
      expect(status).toBe(403)
    })
  })

  it('returns progress audience IDs matching the supplied data', async () => {
    const { status, body } = await callEndpoint(payload, { pathProgress: 3 })
    expect(status).toBe(200)
    expect(body.audiences).toContain(audienceBeginner.id)
    expect(body.audiences).not.toContain(audienceIntermediate.id)
  })

  it('returns IDs sorted ascending', async () => {
    // pathProgress=5 sits in the overlap and matches both Beginner (max 5)
    // and Intermediate (min 5). The combined list must come back sorted.
    const { body } = await callEndpoint(payload, { pathProgress: 5 })
    const ids = body.audiences ?? []
    expect(ids.length).toBeGreaterThanOrEqual(2)
    const sorted = [...ids].sort((a, b) => a - b)
    expect(ids).toEqual(sorted)
  })

  it('matches across multiple progress rule dimensions', async () => {
    const { body } = await callEndpoint(payload, {
      pathProgress: 7,
      meditationsPerWeek: 5,
    })
    expect(body.audiences).toContain(audienceIntermediate.id)
    expect(body.audiences).toContain(audienceFrequent.id)
    expect(body.audiences).not.toContain(audienceBeginner.id)
  })

  it('sets Cache-Control: public, max-age=300, s-maxage=300', async () => {
    const { headers } = await callEndpoint(payload, { pathProgress: 0 })
    expect(headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300')
  })

  it('threads client req through audience lookup and skips query validation', async () => {
    const client = (await testData.createClient(payload, adminUserId, {
      name: 'Audiences Forwarding Test',
    })) as Client

    const findSpy = vi.spyOn(payload, 'find')
    try {
      const { status } = await callEndpoint(
        payload,
        { pathProgress: 0 },
        {
          user: { id: client.id, collection: 'clients', _status: 'published' },
        },
      )
      expect(status).toBe(200)

      const audienceCall = findSpy.mock.calls.find(
        ([args]) => (args as { collection?: string }).collection === 'audiences',
      )
      expect(audienceCall).toBeDefined()
      const forwardedReq = (
        audienceCall![0] as {
          req?: { user?: { id: unknown; collection: string }; context?: Record<string, unknown> }
        }
      ).req
      expect(forwardedReq?.user?.id).toBe(client.id)
      expect(forwardedReq?.user?.collection).toBe('clients')
      expect(forwardedReq?.context?.['skipClientQueryValidation']).toBe(true)
    } finally {
      findSpy.mockRestore()
    }
  })

  describe('Condition audiences', () => {
    it('includes a condition audience with no constraints', async () => {
      const { status, body } = await callEndpoint(payload, {})
      expect(status).toBe(200)
      expect(body.audiences).toContain(audienceConditionOpen.id)
    })

    it('includes condition audience when country matches', async () => {
      const { body } = await callEndpoint(payload, { country: 'US' })
      expect(body.audiences).toContain(audienceConditionUS.id)
    })

    it('excludes condition audience when country does not match', async () => {
      const { body } = await callEndpoint(payload, { country: 'DE' })
      expect(body.audiences).not.toContain(audienceConditionUS.id)
    })

    it('condition and progress audience IDs are combined and sorted ascending', async () => {
      const { body } = await callEndpoint(payload, { country: 'US' })
      const ids = body.audiences ?? []
      const sorted = [...ids].sort((a, b) => a - b)
      expect(ids).toEqual(sorted)
      // Both types contribute to the result
      expect(ids).toContain(audienceConditionOpen.id)
      expect(ids).toContain(audienceConditionUS.id)
    })

    it('excludes audience when progress passes but country does not match', async () => {
      const combined = await testData.createAudience(payload, {
        label: 'Combined Rules',
        pathProgress: { min: 0 },
        location: { countries: ['US'] },
      })
      // pathProgress=0 passes (>= 0), but country=DE fails
      const { body } = await callEndpoint(payload, { pathProgress: 0, country: 'DE' })
      expect(body.audiences).not.toContain(combined.id)
      // Same progress, matching country → included
      const { body: bodyUS } = await callEndpoint(payload, { pathProgress: 0, country: 'US' })
      expect(bodyUS.audiences).toContain(combined.id)
    })

    it('excludes audience when country passes but progress does not match', async () => {
      const combined = await testData.createAudience(payload, {
        label: 'Combined Rules Progress Gate',
        pathProgress: { min: 5 },
        location: { countries: ['US'] },
      })
      // country=US passes, but pathProgress=0 fails (< min 5)
      const { body } = await callEndpoint(payload, { pathProgress: 0, country: 'US' })
      expect(body.audiences).not.toContain(combined.id)
      // Both pass → included
      const { body: bodyPass } = await callEndpoint(payload, { pathProgress: 5, country: 'US' })
      expect(bodyPass.audiences).toContain(combined.id)
    })
  })
})
