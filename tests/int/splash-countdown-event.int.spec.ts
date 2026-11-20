import type { Payload, Where } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SplashBlock } from '@/lib/richEditor/blocks'
import type { Manager, Page } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * `SplashBlock.event` narrows its picker with `filterOptions` and **does not**
 * refuse a save, which is the one judgement in this block worth pinning.
 *
 * Both halves were measured rather than reasoned about. The refusal, armed,
 * makes the page unsaveable by anyone the day its class holds its last session
 * — `validateFilterOptions` re-runs on every save with no exemption for a value
 * that did not change — and unsaveable by a non-admin manager from the start,
 * because Lexical composes its own filter that answers `false` for a collection
 * `admin.hidden` hides from the caller. The consumer degrades every one of
 * those states to that language's online classes and reports it, so the page is
 * the wrong place to enforce them.
 */
describe('splash countdown · the class it may name', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager & { collection: 'managers' }
  let translator: Manager & { collection: 'managers' }

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

  const saveSplash = (eventId: number, user = admin) =>
    payload.update({
      collection: 'pages',
      id: pageId,
      data: { content: splashPage(eventId) },
      user,
      overrideAccess: false,
    })

  /**
   * The ids the editor's picker offers.
   *
   * ⚠ Read off the booted block config, not the source literal: the Lexical
   * adapter replaces a block relationship's `filterOptions` in place with one
   * of its own that composes the declared filter, so the thing the admin
   * actually calls is asynchronous and takes the relation it is resolving.
   */
  const offered = async () => {
    const field = SplashBlock.fields.find((entry) => 'name' in entry && entry.name === 'event')
    const filterOptions = (
      field as { filterOptions?: (args: unknown) => Promise<Where> | Where } | undefined
    )?.filterOptions

    if (!filterOptions) throw new Error('the event field declares no filterOptions')

    const { docs } = await payload.find({
      collection: 'events',
      where: await filterOptions({ relationTo: 'events', user: admin }),
      depth: 0,
      limit: 50,
    })

    return docs.map((doc) => doc.id)
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = { ...env.adminUser, collection: 'managers' }

    const member = await testData.createManager(payload, {
      name: 'Web Translator',
      email: 'web-translator@example.invalid',
      type: 'manager' as const,
      roles: { en: ['web-translator'] },
      currentProject: 'wemeditate-web',
    } as never)
    translator = { ...member, collection: 'managers' }

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
    // `notFinishedWhere` admits it and only the `inactive` arm excludes it.
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

  it('offers only online, running, active classes', async () => {
    const ids = await offered()

    expect(ids).toContain(onlineRunning)
    expect(ids).not.toContain(offline)
    expect(ids).not.toContain(finished)
    expect(ids).not.toContain(inactive)
  })

  it('saves a countdown naming an online, running, active class', async () => {
    const saved = await saveSplash(onlineRunning)
    const block = saved.content?.root.children[0] as unknown as { fields: { event: unknown } }
    const event = block.fields.event

    expect(typeof event === 'object' ? (event as { id: number }).id : event).toBe(onlineRunning)
  })

  // Each of these three is a state the picker refuses and a class can reach on
  // its own afterwards. Refusing the save would strand the page that already
  // names it, so the save is accepted and the site degrades.
  it.each([
    ['an offline class', () => offline],
    ['a finished class', () => finished],
    ['a dormant class', () => inactive],
  ])('keeps the page saveable with %s', async (_label, id) => {
    await expect(saveSplash(id())).resolves.toBeTruthy()
  })

  it('stays saveable after the class it names holds its last session', async () => {
    const expiring = await testData.createEvent(payload, {
      title: 'Countdown Expiring Class',
      inactive: false,
      eventType: 'online',
      onlineUrl: 'https://example.invalid/expiring',
      schedule: { firstDate: '2099-04-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
      _status: 'published',
    } as never)

    await saveSplash(expiring.id)

    // Beneath the hooks, as only time can: the class is now behind us.
    await payload.db.updateOne({
      collection: 'events',
      id: expiring.id,
      data: {
        schedule: {
          firstDate: '2020-04-01T10:00:00.000Z',
          firstDate_tz: 'Europe/London',
          lastDate: '2020-04-01T10:00:00.000Z',
        },
      } as never,
    })

    await expect(
      payload.update({
        collection: 'pages',
        id: pageId,
        data: { title: 'Countdown Host Page, retitled' },
        user: admin,
        overrideAccess: false,
      }),
    ).resolves.toBeTruthy()
  })

  it('lets a manager who may edit the page save it', async () => {
    // ⚠ A non-admin is the case the refusal broke from the start: Lexical
    // composes a filter that answers `false` for a collection `admin.hidden`
    // hides from the caller, and `events` is hidden from a role with no write
    // grant on it.
    await expect(saveSplash(onlineRunning, translator)).resolves.toBeTruthy()
  })
})
