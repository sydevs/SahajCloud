import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Audience } from '@/payload-types'

import { audiencesForUser } from '@/endpoints'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const AUDIENCE_DEFAULTS = {
  pathProgress: 0,
  meditationsPerWeek: 0,
  totalMeditationsViewed: 0,
  totalLecturesViewed: 0,
}

async function callEndpoint(
  payload: Payload,
  query: Record<string, string | number | boolean>,
  options: { skipAudienceDefaults?: boolean } = {},
): Promise<{ status: number; headers: Headers; body: { audiences?: number[]; errors?: unknown } }> {
  const finalQuery = options.skipAudienceDefaults ? query : { ...AUDIENCE_DEFAULTS, ...query }
  const req = {
    payload,
    query: finalQuery,
    headers: new Headers(),
    routeParams: {},
  } as unknown as PayloadRequest

  const response = (await audiencesForUser.handler(req)) as Response
  const body = await response.json()
  return { status: response.status, headers: response.headers, body }
}

describe('audiencesForUser endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  let audienceBeginner: Audience
  let audienceIntermediate: Audience
  let audienceFrequent: Audience

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    // Three audiences whose rule sets target distinct slices of the user-state space.
    // Beginner — pathProgress 0..5
    audienceBeginner = await testData.createAudience(payload, {
      label: 'Beginner',
      rules: { logic: 'AND', pathProgress: { min: 0, max: 5 } },
    })
    // Intermediate — pathProgress 5..10
    audienceIntermediate = await testData.createAudience(payload, {
      label: 'Intermediate',
      rules: { logic: 'AND', pathProgress: { min: 5, max: 10 } },
    })
    // Frequent meditator — meditationsPerWeek >= 3
    audienceFrequent = await testData.createAudience(payload, {
      label: 'Frequent',
      rules: { logic: 'AND', meditationsPerWeek: { min: 3 } },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('returns 400 when audience rule-data params are missing', async () => {
    const { status, body } = await callEndpoint(payload, {}, { skipAudienceDefaults: true })
    expect(status).toBe(400)
    expect(body).toHaveProperty('errors')
  })

  it('returns IDs of audiences whose rules pass for the supplied data', async () => {
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

  it('combines matches across rule dimensions (e.g. path + frequency)', async () => {
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
})
