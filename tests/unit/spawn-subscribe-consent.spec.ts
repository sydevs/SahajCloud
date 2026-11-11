/**
 * `spawnSubscribeFromRegistration`'s own promise: the registrant is registered
 * by the time it runs, so nothing it does may undo that.
 *
 * It runs inside the registration's transaction, so a throw here rolls that
 * registration back. The create was always guarded; the `(user, event)`
 * existence check (#1099) is a second thing that can throw, and a statement
 * timeout or a refused read would otherwise lose a signup that had already
 * succeeded.
 *
 * Driven directly rather than through Payload, because the behaviour under test
 * is what the hook does with a rejected promise — `tests/int/` covers what it
 * does with a real database.
 */
import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { spawnSubscribeFromRegistration } from '@/collections/UserSubmissions/hooks/spawnSubscribeFromRegistration'
import { SUBSCRIBE_OPT_IN } from '@/collections/UserSubmissions/submissionData'

const DATA = {
  type: 'registration',
  user: 7,
  event: 42,
  client: 3,
  submissionData: [
    { field: SUBSCRIBE_OPT_IN, value: 'yes' },
    { field: 'name', value: 'Sam Seeker' },
  ],
}

/** Only what the hook calls: the existence check, the address read, the create. */
function stubReq(held: unknown[] = []) {
  type Args = Record<string, unknown>
  const find = vi.fn(async (_args: Args) => ({ docs: held }))
  const findByID = vi.fn(async (_args: Args) => ({ email: 'sam@example.com' }))
  const create = vi.fn(async (_args: Args) => ({ id: 99 }))
  const error = vi.fn((_entry: Args) => undefined)

  return {
    find,
    findByID,
    create,
    error,
    req: {
      context: {},
      payload: {
        find,
        findByID,
        create,
        logger: { debug: vi.fn(), error, info: vi.fn(), warn: vi.fn() },
      },
    },
  }
}

const run = (req: ReturnType<typeof stubReq>['req']) =>
  (spawnSubscribeFromRegistration as (args: unknown) => Promise<unknown>)({
    data: DATA,
    doc: { id: 1 },
    operation: 'create',
    req: req as unknown as PayloadRequest,
  })

describe('spawnSubscribeFromRegistration', () => {
  it('records the consent when the registrant holds none for this event', async () => {
    const stub = stubReq()

    await expect(run(stub.req)).resolves.toBeTruthy()

    expect(stub.create).toHaveBeenCalledOnce()
    expect(stub.create.mock.calls[0]![0]).toMatchObject({
      data: { type: 'subscribe', event: 42, user: 7 },
    })
  })

  /**
   * The existence check runs before the address read, so the read a repeat
   * signup would throw away is never issued.
   */
  it('skips the address read and the create when a consent row is held', async () => {
    const stub = stubReq([{ id: 55 }])

    await expect(run(stub.req)).resolves.toBeTruthy()

    expect(stub.find).toHaveBeenCalledOnce()
    expect(stub.findByID).not.toHaveBeenCalled()
    expect(stub.create).not.toHaveBeenCalled()
  })

  it('swallows and logs a failed existence check, leaving the registration standing', async () => {
    const stub = stubReq()
    stub.find.mockRejectedValueOnce(new Error('canceling statement due to statement timeout'))

    await expect(run(stub.req)).resolves.toBeTruthy()

    expect(stub.create).not.toHaveBeenCalled()
    expect(stub.error).toHaveBeenCalledOnce()
    expect(stub.error.mock.calls[0]![0]).toMatchObject({
      error: 'canceling statement due to statement timeout',
      submissionId: 1,
    })
  })

  it('swallows and logs a failed address read', async () => {
    const stub = stubReq()
    stub.findByID.mockRejectedValueOnce(new Error('connection terminated'))

    await expect(run(stub.req)).resolves.toBeTruthy()

    expect(stub.create).not.toHaveBeenCalled()
    expect(stub.error).toHaveBeenCalledOnce()
  })
})
