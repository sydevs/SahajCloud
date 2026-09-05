/**
 * The review endpoint's LOCALE gate, driven through Payload's real REST
 * pipeline (#701).
 *
 * `event-submissions.int.spec.ts` exercises `applyReview` directly and never
 * touches `POST /api/event-submissions/:id/review`, so nothing observed how
 * `req.locale` is derived. That is where the bug lived: the admin's Accept /
 * Reject buttons sent no `?locale=`, Payload resolved the default locale, and
 * `hasPermission` read the reviewer's English roles — empty for a manager whose
 * roles live only in French, so every action answered 403.
 *
 * A sibling file rather than a new suite in that spec, because `getPayload`
 * caches per config: a second `createTestEnvironment()` in one file returns the
 * FIRST instance (see `tests/AGENTS.md`).
 */
import type { RestClient } from '../utils/restRequest'
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Manager } from '@/payload-types'



import { createRestClientAs } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('POST /api/event-submissions/:id/review — locale gate', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let env: Awaited<ReturnType<typeof createTestEnvironment>>

  let frenchReviewer: Manager
  let rest: RestClient
  let countryId: number
  let cityId: number

  /**
   * A pending submission in the reviewer's region. Created per case, since a
   * successful reject moves it out of `pending` and the next call would then
   * fail on the status transition rather than the gate under test.
   */
  const pendingSubmission = async (): Promise<number> => {
    const created = await payload.create({
      collection: 'event-submissions',
      overrideAccess: true,
      data: {
        submitterInfo: { name: 'Aria Visitor', email: 'aria@example.com' },
        regionHint: { anchorRegion: cityId },
        proposed: { eventType: 'offline', address: { city: 'Novo Selo', street: '1 Main St' } },
      } as never,
    })
    await payload.update({
      collection: 'event-submissions',
      id: created.id,
      overrideAccess: true,
      data: { region: cityId, status: 'pending' },
    })
    return created.id
  }

  const review = (id: number, query = '') =>
    rest(`/api/event-submissions/${id}/review${query}`, {
      method: 'POST',
      json: { action: 'reject' },
    })

  beforeAll(async () => {
    env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    // Roles in French ONLY — the shape of the manager in the bug report.
    frenchReviewer = await testData.createManager(payload, {
      type: 'manager',
      roles: { fr: ['atlas-manager'] },
    })

    const country = await testData.createRegion(payload, {
      name: 'Submissia',
      level: 'country',
      slug: 'sb',
      managers: [frenchReviewer.id],
    })
    countryId = country.id

    // `anchorRegion` must be a city or venue — prepareSubmission rejects a
    // country outright (`region_level_invalid`).
    const city = await testData.createRegion(payload, {
      name: 'Sub City',
      level: 'city',
      parent: countryId,
    })
    cityId = city.id

    rest = await createRestClientAs(env, frenchReviewer)
  })

  afterAll(async () => {
    await cleanup()
  })

  it('denies a request naming no locale, because it resolves to the default', async () => {
    const { status } = await review(await pendingSubmission())
    expect(status).toBe(403)
  })

  it('denies it under a locale the reviewer holds no roles in', async () => {
    const { status } = await review(await pendingSubmission(), '?locale=en')
    expect(status).toBe(403)
  })

  it('allows it under the locale the reviewer holds roles in', async () => {
    const { status } = await review(await pendingSubmission(), '?locale=fr')
    expect(status).toBe(200)
  })
})
