/**
 * The wiring, not just the helper.
 *
 * A spec on `captureFailure` alone cannot see whether the Local API is wrapped
 * at all, whether the wrapper rethrows, or whether it stands down on a routed
 * request — and an unreached capture site with a green spec beside it is
 * exactly the shape #1039 set out to make visible.
 */
import type { Payload } from 'payload'

import { ValidationError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installLocalApiCapture } from '@/plugins/sentry/localApiCapture'

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

vi.mock('@/lib/env/deploymentEnvironment', () => ({
  deploymentEnvironment: () => 'test',
}))

const MANAGER = { id: 7, collection: 'managers', email: 'editor@sydevelopers.com' }
const URL = 'https://cloud.sydevelopers.com/admin/collections/pages/create'

/**
 * The request the admin page render hands to `payload.create`. `headers` and
 * `payload.collections` are there because `describeRejectedCredential` reads
 * both on any sub-500 capture.
 */
const buildRequest = (payloadAPI: string, user?: unknown) =>
  ({
    headers: new Headers(),
    locale: 'en',
    payload: { collections: { managers: {}, pages: {} }, logger: { warn: vi.fn() } },
    payloadAPI,
    url: URL,
    user,
  }) as never

const adminRequest = () => buildRequest('local', MANAGER)

/** A request Payload routed, carrying the stamp `createLocalReq` preserves. */
const routedRequest = () => buildRequest('REST', MANAGER)

/** What a job, a seed or an operator script writes with. */
const unattendedRequest = () => buildRequest('local')

/**
 * Payload's own error, not a look-alike: `captureFailure` reads the field paths
 * through `validationFieldErrors`, which asks `instanceof`.
 */
const validationError = () =>
  new ValidationError({
    collection: 'pages',
    errors: [{ label: 'Slug', message: 'Value must be unique', path: 'slug' }],
  })

/** A stub standing in for the live instance `onInit` wraps. */
const stubPayload = (failWith: () => unknown) => {
  const failing = () => async (_options?: unknown) => {
    throw failWith()
  }

  return {
    create: failing(),
    delete: failing(),
    duplicate: failing(),
    update: failing(),
    updateGlobal: failing(),
    jobs: { queue: failing() },
  } as unknown as Payload
}

const install = (failWith: () => unknown) => {
  const payload = stubPayload(failWith)
  installLocalApiCapture(payload)
  return { payload }
}

const tags = () => Object.fromEntries(sentry.scope.setTag.mock.calls)
const extras = () => Object.fromEntries(sentry.scope.setExtra.mock.calls)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a Local API write the admin makes outside a route', () => {
  it('reports one error event naming the collection and the failing field', async () => {
    const error = validationError()
    const { payload } = install(() => error)

    await expect(
      payload.create({ collection: 'pages', data: {}, req: adminRequest() } as never),
    ).rejects.toBe(error)

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(sentry.captureException).toHaveBeenCalledWith(error)
    expect(tags()).toMatchObject({ collection: 'pages', capture_source: 'localApi' })
    expect(extras()).toMatchObject({ fields: ['slug'], status: 400, url: URL })
  })

  it('reports at error level, not the warning a 400 would carry on a route', async () => {
    const { payload } = install(validationError)

    await expect(
      payload.create({ collection: 'pages', data: {}, req: adminRequest() } as never),
    ).rejects.toThrow()

    expect(sentry.scope.setLevel).toHaveBeenCalledWith('error')
  })

  it('names the acting manager', async () => {
    const { payload } = install(validationError)

    await expect(
      payload.create({ collection: 'pages', data: {}, req: adminRequest() } as never),
    ).rejects.toThrow()

    expect(sentry.scope.setUser).toHaveBeenCalledWith({
      id: '7',
      email: 'editor@sydevelopers.com',
    })
  })

  it('covers the schedule-publish pair — a delete and a queue', async () => {
    const { payload } = install(() => new Error('could not reach payload-jobs'))

    await expect(
      payload.delete({ collection: 'payload-jobs', req: adminRequest(), where: {} } as never),
    ).rejects.toThrow()
    expect(tags()).toMatchObject({ collection: 'payload-jobs', capture_source: 'localApi' })

    await expect(
      payload.jobs.queue({ task: 'schedulePublish', req: adminRequest() } as never),
    ).rejects.toThrow()

    expect(sentry.captureException).toHaveBeenCalledTimes(2)
  })

  it('reports once when a hook writes through the Local API inside the write', async () => {
    const error = new Error('the afterChange hook could not update its sibling')
    const payload = stubPayload(() => error)
    // An admin `create` whose hook writes through the Local API. Set before the
    // install, so the inner call reaches the wrapped `update` and both wrappers
    // see one throw on its way out.
    payload.create = ((options: never) => payload.update(options)) as typeof payload.create
    installLocalApiCapture(payload)

    await expect(
      payload.create({ collection: 'pages', data: {}, req: adminRequest() } as never),
    ).rejects.toBe(error)

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('tags a global write with its slug', async () => {
    const { payload } = install(() => new Error('nope'))

    await expect(
      payload.updateGlobal({ slug: 'sy-atlas-config', data: {}, req: adminRequest() } as never),
    ).rejects.toThrow()

    expect(tags()).toMatchObject({ collection: 'sy-atlas-config' })
  })
})

describe('what must not report', () => {
  it('stands down on a routed request, where afterError reports instead', async () => {
    const { payload } = install(validationError)

    await expect(
      payload.create({ collection: 'pages', data: {}, req: routedRequest() } as never),
    ).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('ignores a write with no acting user — a job, a seed, a script', async () => {
    const { payload } = install(validationError)

    await expect(payload.create({ collection: 'pages', data: {} } as never)).rejects.toThrow()
    await expect(
      payload.create({ collection: 'pages', data: {}, req: unattendedRequest() } as never),
    ).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('ignores a `user` option with no request — the eventImport task', async () => {
    const { payload } = install(validationError)

    await expect(
      payload.create({ collection: 'events', data: {}, user: MANAGER } as never),
    ).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('keeps mapPostgresCastError excluded on the new site too', async () => {
    const castFailure = Object.assign(new Error('query failed'), {
      cause: {
        code: '22P02',
        message: 'invalid input value for enum enum_meditations_type: "path"',
      },
    })
    const { payload } = install(() => castFailure)

    await expect(
      payload.update({ collection: 'meditations', id: 1, data: {}, req: adminRequest() } as never),
    ).rejects.toBe(castFailure)

    expect(sentry.captureException).not.toHaveBeenCalled()
  })
})
