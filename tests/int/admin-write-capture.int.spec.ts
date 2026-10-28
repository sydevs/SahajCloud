/**
 * The two facts about a real Payload write that the unit lane can only assume.
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
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { installLocalApiCapture } from '@/plugins/sentry/localApiCapture'

import { createTestEnvironment } from '../utils/testHelpers'

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  scope: {
    setUser: vi.fn(),
    setTag: vi.fn(),
    setExtra: vi.fn(),
    setLevel: vi.fn(),
    setFingerprint: vi.fn(),
  },
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: sentry.captureException,
  withScope: (callback: (scope: typeof sentry.scope) => void) => callback(sentry.scope),
}))

let payload: Payload
let buildRequest: (payloadAPI: 'local' | 'REST') => PayloadRequest
let cleanup: () => Promise<void>

beforeAll(async () => {
  const env = await createTestEnvironment()
  payload = env.payload
  cleanup = env.cleanup

  // The suite config carries no `sentryPlugin`, so `onInit` never ran — this is
  // the same call the plugin makes there.
  installLocalApiCapture(payload)

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
    expect(Object.fromEntries(sentry.scope.setTag.mock.calls)).toMatchObject({
      capture_source: 'localApi',
      collection: 'pages',
    })
    expect(Object.fromEntries(sentry.scope.setExtra.mock.calls)).toMatchObject({
      fields: ['title'],
      status: 400,
    })
    expect(sentry.scope.setLevel).toHaveBeenCalledWith('error')
  })

  // Not the unit lane's case repeated: there the stamp is read off a stub, so
  // nothing shows that `createLocalReq` leaves a routed one alone. It does that
  // for the whole nested tree too, hooks of this collection included.
  it('reports nothing for the same failure on a routed request', async () => {
    await expect(createPageWithoutTitle(buildRequest('REST'))).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
  })
})
