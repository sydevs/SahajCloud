import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Manager, Page } from '@/payload-types'

import { createRestClient, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * `SplashBlock.event` is narrowed by `filterOptions` alone, and the thing that
 * applies it on a save is Payload's own `relationship` validator — installed
 * only because the field declares no `validate` of its own
 * (`src/collections/AGENTS.md`). Declaring one would leave the admin picker
 * narrowed and nothing refusing an API write, so the refusal is asserted here
 * rather than by reading the config.
 *
 * Both paths are covered: the Local API, and `PATCH /api/pages/:id`, which is
 * the one a client or a script actually reaches.
 */
describe('splash countdown · the event it may name', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let rest: RestClient
  let admin: Manager & { collection: 'managers' }

  let onlineRunning: number
  let offline: number
  let finished: number
  let inactive: number
  let pageId: number

  const splashPage = (eventId: number): Page['content'] =>
    ({
      root: {
        type: 'root',
        children: [
          {
            type: 'block',
            version: 2,
            fields: {
              id: `splash-${eventId}`,
              blockName: 'Splash',
              blockType: 'splash',
              layout: 'countdown',
              textColor: 'dark',
              title: 'Next live session',
              event: eventId,
            },
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
    }) as unknown as Page['content']

  // ⚠ **The save must carry a user.** Payload hands a field's `beforeChange`
  // hook no `overrideAccess`, so the Lexical adapter forwards `undefined` and
  // `validateFilterOptions` falls back to enforcing access — a userless write
  // cannot read `events` at all and every selection is refused. `src/fixture/load.ts`
  // writes `pages` as its own admin for the same reason.
  const saveSplash = (eventId: number) =>
    payload.update({
      collection: 'pages',
      id: pageId,
      data: { content: splashPage(eventId) },
      user: admin,
    })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    rest = await createRestClient(env)
    admin = { ...env.adminUser, collection: 'managers' }

    const running = await testData.createEvent(payload, {
      title: 'Countdown Running Class',
      inactive: false,
      eventType: 'online',
      onlineUrl: 'https://example.invalid/running',
      // Open-ended daily — never finishes.
      schedule: {
        firstDate: '2021-04-01T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
        recurrenceType: 'DAILY',
        interval: 1,
      },
      _status: 'published',
    } as never)
    onlineRunning = running.id

    const offlineClass = await testData.createEvent(payload, {
      title: 'Countdown Offline Class',
      inactive: false,
      eventType: 'offline',
      schedule: {
        firstDate: '2021-04-01T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
        recurrenceType: 'DAILY',
        interval: 1,
      },
      _status: 'published',
    } as never)
    offline = offlineClass.id

    const finishedClass = await testData.createEvent(payload, {
      title: 'Countdown Finished Class',
      inactive: false,
      eventType: 'online',
      onlineUrl: 'https://example.invalid/finished',
      // A one-off five years back — long finished.
      schedule: { firstDate: '2021-04-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
      _status: 'published',
    } as never)
    finished = finishedClass.id

    // A dormant class keeps `eventType: 'online'` and has no schedule at all, so
    // `notFinishedWhere` admits it and only the `inactive` arm refuses it.
    const dormant = await testData.createEvent(payload, {
      title: 'Countdown Dormant Class',
      eventType: 'online',
      onlineUrl: 'https://example.invalid/dormant',
      _status: 'published',
    } as never)
    inactive = dormant.id

    const page = await testData.createPage(payload, { title: 'Countdown Host Page' })
    pageId = page.id
  })

  afterAll(async () => {
    await cleanup()
  })

  it('saves a countdown naming an online, running, active class', async () => {
    const saved = await saveSplash(onlineRunning)
    const block = saved.content?.root.children[0] as unknown as { fields: { event: unknown } }
    const event = block.fields.event
    expect(typeof event === 'object' ? (event as { id: number }).id : event).toBe(onlineRunning)
  })

  it.each([
    ['an offline class', () => offline],
    ['a finished class', () => finished],
    ['a dormant class', () => inactive],
  ])('refuses a countdown naming %s', async (_label, id) => {
    await expect(saveSplash(id())).rejects.toThrow(/field is invalid.*Event/i)
  })

  // The admin's own form-state pass validates with `event: 'onChange'`, which
  // `relationship` short-circuits past — so the picker narrows there and nothing
  // refuses. Only a save refuses, and REST is the save nobody sees.
  it('refuses the same write over PATCH /api/pages/:id', async () => {
    const refused = await rest(`/api/pages/${pageId}`, {
      method: 'PATCH',
      json: { content: splashPage(offline) },
    })
    expect(refused.status).toBe(400)

    const accepted = await rest(`/api/pages/${pageId}`, {
      method: 'PATCH',
      json: { content: splashPage(onlineRunning) },
    })
    expect(accepted.status).toBe(200)
  })
})
