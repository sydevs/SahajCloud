/**
 * The facts about a real Payload write that the unit lane can only assume.
 *
 * One: that `data.errors[].path` is where a failing field's name lives — a
 * stubbed error that is wrong about the shape passes while production reports
 * no field at all, which is the gap #1039 is about.
 *
 * Two: that `createLocalReq` **preserves** a `REST` stamp into a Local API
 * call. The whole gate rests on it. Nothing in this repo sets that property, so
 * only a real `payload.create` can show it still holds after a Payload bump.
 *
 * `pages` is the collection that reaches the autosave create-on-open, and
 * `title` is its one required field.
 *
 * Three: that the job runner reads `schedulePublish`'s handler off the live
 * config, so the wrapper `onInit` installs is the one a scheduled publish runs.
 *
 * Four: that Payload's own preferences upsert, create and update alike, still
 * makes the exact call the wrapper matches, and reads only `.value` back — what
 * lets a failed one answer with the incoming preferences instead of blanking
 * the list.
 */
import type { Payload, PayloadRequest } from 'payload'

import { upsertPreferences } from '@payloadcms/ui/utilities/upsertPreferences'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  installLocalApiCapture,
  installScheduledPublishCapture,
} from '@/plugins/sentry/localApiCapture'

import { createTestEnvironment } from '../utils/testHelpers'

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({
  captureException: sentry.captureException,
}))

/** The capture context `captureFailure` handed the SDK on its latest call. */
const captured = () =>
  (sentry.captureException.mock.calls.at(-1)?.[1] ?? {}) as {
    extra?: Record<string, unknown>
    fingerprint?: string[]
    level?: string
    tags?: Record<string, unknown>
    user?: Record<string, unknown>
  }

let payload: Payload
let buildRequest: (payloadAPI: 'local' | 'REST') => PayloadRequest
let cleanup: () => Promise<void>
let admin: { id: number | string }

beforeAll(async () => {
  const env = await createTestEnvironment()
  payload = env.payload
  cleanup = env.cleanup
  admin = env.adminUser

  // The suite config carries no `sentryPlugin`, so `onInit` never ran — this is
  // the same call the plugin makes there.
  installLocalApiCapture(payload)
  installScheduledPublishCapture(payload)

  buildRequest = (payloadAPI) =>
    ({
      headers: new Headers(),
      locale: 'en',
      payload,
      payloadAPI,
      url: 'https://cloud.sydevelopers.com/admin/collections/pages/create',
      user: env.adminUser,
    }) as unknown as PayloadRequest
})

afterAll(async () => {
  await cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

const createPageWithoutTitle = (req?: PayloadRequest) =>
  payload.create({ collection: 'pages', data: {}, req } as never)

describe('a failed admin write through the Local API', () => {
  it('reports one error event naming the collection and the failing field', async () => {
    await expect(createPageWithoutTitle(buildRequest('local'))).rejects.toThrow()

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(captured().tags).toMatchObject({
      capture_source: 'localApi',
      collection: 'pages',
    })
    expect(captured().extra).toMatchObject({
      fields: ['title'],
      status: 400,
    })
    expect(captured().level).toBe('error')
  })

  // Not the unit lane's case repeated: there the stamp is read off a stub, so
  // nothing shows that `createLocalReq` leaves a routed one alone. It does that
  // for the whole nested tree too, hooks of this collection included.
  it('reports nothing for the same failure on a routed request', async () => {
    await expect(createPageWithoutTitle(buildRequest('REST'))).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
  })
})

describe('a scheduled publish that fails when its job runs', () => {
  it('reports once, naming the page it was for', async () => {
    const draft = await payload.create({
      collection: 'pages',
      data: {} as never,
      draft: true,
    })
    const job = await payload.jobs.queue({
      // A string id, as `schedulePublishHandler` stores it (payload#10481).
      input: { doc: { relationTo: 'pages', value: String(draft.id) }, type: 'publish' } as never,
      task: 'schedulePublish',
    })
    vi.clearAllMocks()

    // An untitled page cannot publish: `title` is required.
    await payload.jobs.runByID({ id: job.id })

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(captured().tags).toMatchObject({
      capture_source: 'job',
      collection: 'pages',
      target: `pages/${draft.id}`,
    })
    expect(captured().extra).toMatchObject({ fields: ['title'] })
  })
})

describe("Payload's preferences upsert, as an admin list render makes it", () => {
  it('reports a failed write and still answers with the incoming preferences', async () => {
    // A manager deleted mid-session: the `user` relationship's foreign key
    // refuses the id, so the write itself fails.
    const req = { payload, user: { id: 999_999, collection: 'managers' } } as PayloadRequest

    await expect(
      upsertPreferences({ key: 'collection-pages', req, value: { limit: 10 } }),
    ).resolves.toEqual({ limit: 10 })

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(captured().tags).toMatchObject({
      capture_source: 'localApi',
      collection: 'payload-preferences',
    })
    expect(captured().user).toEqual({ id: '999999' })
  })

  it('answers a failed update with the merged preferences', async () => {
    const req = { payload, user: { ...admin, collection: 'managers' } } as unknown as PayloadRequest
    await upsertPreferences({ key: 'collection-lectures', req, value: { limit: 10 } })
    vi.clearAllMocks()

    // The stored row exists now, so this is `upsertPreferences`' by-id update.
    const fail = vi.spyOn(payload.db, 'updateOne').mockRejectedValueOnce(new Error('db down'))
    try {
      await expect(
        upsertPreferences({ key: 'collection-lectures', req, value: { sort: 'title' } }),
      ).resolves.toEqual({ limit: 10, sort: 'title' })
    } finally {
      fail.mockRestore()
    }

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(captured().tags).toMatchObject({ collection: 'payload-preferences' })
  })
})
