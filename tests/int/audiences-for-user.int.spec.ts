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

  // Progress audiences — matched via SQL WHERE on native range fields
  let audienceBeginner: Audience // pathProgress 0..5
  let audienceIntermediate: Audience // pathProgress 5..10
  let audienceFrequent: Audience // meditationsPerWeek >= 3

  // Condition audiences — matched via JS filter on country/schedule/eventTime
  let audienceConditionOpen: Audience // no constraints → always passes
  let audienceConditionUS: Audience // country: ['US']
  let audienceConditionScheduled: Audience // has schedule → requires timezone param

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

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

    audienceConditionOpen = await testData.createConditionAudience(payload, {
      label: 'Open Condition',
    })
    audienceConditionUS = await testData.createConditionAudience(payload, {
      label: 'US Condition',
      country: ['US'],
    })
    audienceConditionScheduled = await testData.createConditionAudience(payload, {
      label: 'Scheduled Condition',
      schedule: {
        firstDate: '2024-01-15T09:00:00.000Z',
        firstDate_tz: 'Europe/London',
        recurrenceType: 'DAILY',
        interval: 1,
      } as Audience['schedule'],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('returns 400 when required progress params are missing', async () => {
    const { status, body } = await callEndpoint(payload, {}, { skipAudienceDefaults: true })
    expect(status).toBe(400)
    expect(body).toHaveProperty('errors')
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

    it('excludes country condition audience when no country param is supplied', async () => {
      const { body } = await callEndpoint(payload, {}) // no country param
      expect(body.audiences).not.toContain(audienceConditionUS.id)
    })

    it('excludes schedule condition audience when timezone param is missing', async () => {
      const { body } = await callEndpoint(payload, {}) // no timezone
      expect(body.audiences).not.toContain(audienceConditionScheduled.id)
    })

    it('still includes progress audiences when condition audiences are excluded', async () => {
      // No timezone → schedule condition audiences excluded, but progress ones still match.
      const { body } = await callEndpoint(payload, { pathProgress: 3 })
      expect(body.audiences).toContain(audienceBeginner.id)
      expect(body.audiences).not.toContain(audienceConditionScheduled.id)
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
  })
})
