/**
 * What a real Payload failure puts in the Sentry event.
 *
 * The unit spec builds its own `ValidationError`, so it pins the wrapper's
 * behaviour against an assumption: that `data.errors[].path` is where a field
 * name lives. Only a real `payload.create` settles that — a hand-built fixture
 * that is wrong about the shape passes while production reports no field at
 * all, which is the gap #1039 is about.
 *
 * `pages` is the collection that reaches the autosave create-on-open, and
 * `title` is its one required field.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { installLocalApiCapture } from '@/plugins/sentry/localApiCapture'
import { withPayloadRouteScope } from '@/plugins/sentry/payloadRouteScope'

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
let cleanup: () => Promise<void>
let adminRequest: PayloadRequest

beforeAll(async () => {
  const env = await createTestEnvironment()
  payload = env.payload
  cleanup = env.cleanup

  // The suite config carries no `sentryPlugin`, so `onInit` never ran — this is
  // the same call the plugin makes there.
  installLocalApiCapture(payload)

  adminRequest = {
    headers: new Headers(),
    locale: 'en',
    payload,
    url: 'https://cloud.sydevelopers.com/admin/collections/pages/create',
    user: env.adminUser,
  } as unknown as PayloadRequest
})

afterAll(async () => {
  await cleanup()
})

const createPageWithoutTitle = (req?: PayloadRequest) =>
  payload.create({ collection: 'pages', data: {}, req } as never)

describe('a failed admin write through the Local API', () => {
  it('reports one error event naming the collection and the failing field', async () => {
    sentry.captureException.mockClear()
    sentry.scope.setTag.mockClear()
    sentry.scope.setExtra.mockClear()
    sentry.scope.setLevel.mockClear()

    await expect(createPageWithoutTitle(adminRequest)).rejects.toThrow()

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

  it('reports nothing for the same failure inside a Payload route', async () => {
    sentry.captureException.mockClear()

    const routed = withPayloadRouteScope(() => createPageWithoutTitle(adminRequest))
    await expect(routed()).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
  })
})
