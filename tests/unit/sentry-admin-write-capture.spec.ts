/**
 * The wiring, not just the helper.
 *
 * A spec on `captureFailure` alone cannot see whether the Local API is wrapped
 * at all, whether the wrapper rethrows, or whether it stands down on a routed
 * request — and an unreached capture site with a green spec beside it is
 * exactly the shape #1039 set out to make visible.
 */
import type { Payload } from 'payload'

import { JobCancelledError, ValidationError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installJobCapture } from '@/plugins/sentry/jobCapture'
import { installLocalApiCapture } from '@/plugins/sentry/localApiCapture'

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
    config: {
      jobs: {
        tasks: [
          { slug: 'schedulePublish', handler: failing() },
          { slug: 'cleanupCollections', retries: 2, handler: failing() },
          { slug: 'verifyEmbeds', retries: { attempts: 1 }, handler: failing() },
          { slug: 'deliverSubmission', handler: failing() },
        ],
      },
    },
  } as unknown as Payload
}

/**
 * A task's handler, called the way the job runner calls a single-task job: as
 * task `'1'`, with the job's `taskStatus` counting the tries before this one.
 */
const runTask = (
  payload: Payload,
  slug: string,
  input: unknown,
  req: unknown,
  priorTries = 0,
  job: Record<string, unknown> = { taskSlug: slug },
) => {
  const task = payload.config.jobs.tasks?.find((candidate) => candidate.slug === slug)
  const taskStatus = priorTries ? { [slug]: { '1': { totalTried: priorTries } } } : {}
  return (task?.handler as (args: unknown) => Promise<unknown>)({
    input,
    job: { id: 42, taskStatus, ...job },
    req,
  })
}

const install = (failWith: () => unknown) => {
  const payload = stubPayload(failWith)
  installLocalApiCapture(payload)
  installJobCapture(payload)
  return { payload }
}

const tags = () => captured().tags ?? {}
const extras = () => captured().extra ?? {}

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
    expect(sentry.captureException).toHaveBeenCalledWith(error, expect.anything())
    expect(tags()).toMatchObject({ collection: 'pages', capture_source: 'localApi' })
    expect(extras()).toMatchObject({ fields: ['slug'], status: 400, url: URL })
  })

  it('reports at error level, not the warning a 400 would carry on a route', async () => {
    const { payload } = install(validationError)

    await expect(
      payload.create({ collection: 'pages', data: {}, req: adminRequest() } as never),
    ).rejects.toThrow()

    expect(captured().level).toBe('error')
  })

  it('names the acting manager', async () => {
    const { payload } = install(validationError)

    await expect(
      payload.create({ collection: 'pages', data: {}, req: adminRequest() } as never),
    ).rejects.toThrow()

    expect(captured().user).toEqual({
      id: '7',
      email: 'editor@sydevelopers.com',
    })
  })

  it('covers the cancel half of schedule-publish, which passes a request', async () => {
    const { payload } = install(() => new Error('could not reach payload-jobs'))

    await expect(
      payload.delete({ collection: 'payload-jobs', req: adminRequest(), where: {} } as never),
    ).rejects.toThrow()

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(tags()).toMatchObject({ collection: 'payload-jobs', capture_source: 'localApi' })
  })

  /**
   * ⚠ No `req`, deliberately. `schedulePublishHandler` passes only `input`,
   * `task` and `waitUntil` — so a spec that hands `jobs.queue` a request keeps
   * the acting-user gate green over a path it never covers.
   */
  it('covers the scheduling half, which passes none', async () => {
    const { payload } = install(() => new Error('could not write the job row'))

    await expect(
      payload.jobs.queue({
        input: {
          doc: { relationTo: 'pages', value: '12' },
          type: 'publish',
          user: { relationTo: 'managers', value: 7 },
        },
        task: 'schedulePublish',
        waitUntil: new Date(),
      } as never),
    ).rejects.toThrow()

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    // The schedule's own target, so one failing schedule is not every other's issue.
    expect(tags()).toMatchObject({
      collection: 'payload-jobs',
      capture_source: 'localApi',
      target: 'pages/12',
    })
    // Named from the queued input, the only place that path records who asked.
    expect(captured().user).toEqual({ id: '7' })
  })

  it('still reports a queue with no request whose input names nobody', async () => {
    const { payload } = install(() => new Error('could not write the job row'))

    await expect(
      payload.jobs.queue({ input: {}, task: 'schedulePublish' } as never),
    ).rejects.toThrow()

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(captured().user).toBeUndefined()
  })

  it('ignores a queue a job or a cron tick makes, with no acting user', async () => {
    const { payload } = install(() => new Error('could not write the job row'))

    await expect(
      payload.jobs.queue({
        input: {},
        req: unattendedRequest(),
        task: 'deliverSubmission',
      } as never),
    ).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('leaves a queue a routed request owns to afterError', async () => {
    const { payload } = install(() => new Error('could not write the job row'))

    await expect(
      payload.jobs.queue({ input: {}, req: routedRequest(), task: 'deliverSubmission' } as never),
    ).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('drops a tag whose value is null or empty', async () => {
    const { payload } = install(() => new Error('nope'))
    const req = { ...(adminRequest() as object), locale: null }

    await expect(payload.create({ collection: '', data: {}, req } as never)).rejects.toThrow()

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(Object.keys(tags())).not.toContain('locale')
    expect(Object.keys(tags())).not.toContain('collection')
  })

  it('tags a global write with its slug', async () => {
    const { payload } = install(() => new Error('nope'))

    await expect(
      payload.updateGlobal({ slug: 'sy-atlas-config', data: {}, req: adminRequest() } as never),
    ).rejects.toThrow()

    expect(tags()).toMatchObject({ collection: 'sy-atlas-config' })
  })
})

describe('the publish a schedule runs', () => {
  const scheduled = {
    doc: { relationTo: 'pages', value: '12' },
    type: 'publish',
    user: { relationTo: 'managers', value: 7 },
  }

  it('reports a schedulePublish job that fails, naming its target and who scheduled it', async () => {
    const error = validationError()
    const { payload } = install(() => error)

    await expect(runTask(payload, 'schedulePublish', scheduled, unattendedRequest())).rejects.toBe(
      error,
    )

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(captured().level).toBe('error')
    expect(tags()).toMatchObject({
      collection: 'pages',
      capture_source: 'job',
      target: 'pages/12',
    })
    expect(captured().user).toEqual({ id: '7' })
  })

  it('names who scheduled it, not whoever triggered the run', async () => {
    const { payload } = install(() => new Error('nope'))

    // `/api/payload-jobs/run` hands the job the triggering admin's request.
    await expect(
      runTask(payload, 'schedulePublish', scheduled, buildRequest('local', { id: 99 })),
    ).rejects.toThrow()

    expect(captured().user).toEqual({ id: '7' })
  })

  it('tags a scheduled global by its slug', async () => {
    const { payload } = install(() => new Error('nope'))

    await expect(
      runTask(payload, 'schedulePublish', { global: 'wm-web-config' }, unattendedRequest()),
    ).rejects.toThrow()

    expect(tags()).toMatchObject({ collection: 'wm-web-config', target: 'wm-web-config' })
  })
})

describe('a job run of ours that fails', () => {
  it('reports once, on the final attempt, tagging the task and the job', async () => {
    const error = new Error('could not sweep')
    const { payload } = install(() => error)

    // `retries: 2` — the third try is the last.
    for (const prior of [0, 1]) {
      await expect(
        runTask(payload, 'cleanupCollections', {}, unattendedRequest(), prior),
      ).rejects.toBe(error)
    }
    expect(sentry.captureException).not.toHaveBeenCalled()

    await expect(runTask(payload, 'cleanupCollections', {}, unattendedRequest(), 2)).rejects.toBe(
      error,
    )

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(captured().level).toBe('error')
    expect(tags()).toMatchObject({
      capture_source: 'job',
      task: 'cleanupCollections',
      job_id: '42',
    })
    expect(Object.keys(tags())).not.toContain('collection')
    expect(captured().user).toBeUndefined()
  })

  it('reads `retries` in its object form too', async () => {
    const { payload } = install(() => new Error('nope'))

    await expect(runTask(payload, 'verifyEmbeds', {}, unattendedRequest(), 0)).rejects.toThrow()
    expect(sentry.captureException).not.toHaveBeenCalled()

    await expect(runTask(payload, 'verifyEmbeds', {}, unattendedRequest(), 1)).rejects.toThrow()
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('sends no input of any task but schedulePublish, even one shaped like it', async () => {
    const { payload } = install(() => new Error('nope'))
    const lookalike = {
      doc: { relationTo: 'pages', value: '12' },
      user: { relationTo: 'managers', value: 7 },
    }

    await expect(
      runTask(payload, 'deliverSubmission', lookalike, unattendedRequest()),
    ).rejects.toThrow()

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(Object.keys(tags())).not.toContain('target')
    expect(Object.keys(tags())).not.toContain('collection')
    expect(captured().user).toBeUndefined()
  })

  it('reports nothing for a cancelled job', async () => {
    const { payload } = install(() => new JobCancelledError('cancelled'))

    await expect(runTask(payload, 'schedulePublish', {}, unattendedRequest())).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('reports nothing for a task run inside a workflow, whose retries it cannot see', async () => {
    const { payload } = install(() => new Error('nope'))

    await expect(
      runTask(payload, 'cleanupCollections', {}, unattendedRequest(), 2, {
        taskSlug: undefined,
        workflowSlug: 'nightly',
      }),
    ).rejects.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
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
