/**
 * How the import components treat what an endpoint answers, beyond its body
 * (#828): a batch another request holds, and a gateway that gave up first.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GATEWAY_REFUSAL,
  refusalMessage,
  sendImportRequest,
} from '@/components/admin/RegionImport/importUrls'

let answers: { body: unknown; status: number }[]
let sent: number

beforeEach(() => {
  vi.useFakeTimers()
  answers = []
  sent = 0
  vi.stubGlobal('fetch', () => {
    sent += 1
    const answer = answers.shift()
    if (!answer) throw new Error('Unscripted request')
    return Promise.resolve({
      json: () => Promise.resolve(answer.body),
      ok: answer.status < 400,
      status: answer.status,
    })
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const busy = { body: { busy: true, errors: [{ message: 'busy' }] }, status: 409 }

describe('sendImportRequest', () => {
  /**
   * ⚠ A 409 `busy` is the request a dropped connection left running, and it
   * carries on by itself — so it is waited out, not reported as a failure.
   */
  it('waits out a batch another request holds, then answers what the batch says', async () => {
    answers = [busy, busy, { body: { pending: 0 }, status: 200 }]
    const pending = sendImportRequest('/x', 'POST')
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toEqual({ body: { pending: 0 }, ok: true, status: 200 })
    expect(sent).toBe(3)
  })

  it('gives up waiting after its bound, answering the 409 it last saw', async () => {
    answers = [busy, busy, busy]
    const pending = sendImportRequest('/x', 'POST', undefined, { busyRetries: 2 })
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ ok: false, status: 409 })
    expect(sent).toBe(3)
  })

  it('reports a 409 that is not a busy batch at once', async () => {
    answers = [{ body: { errors: [{ message: 'committing' }] }, status: 409 }]
    await expect(sendImportRequest('/x', 'POST')).resolves.toMatchObject({ status: 409 })
    expect(sent).toBe(1)
  })
})

describe('refusalMessage', () => {
  it('prefers the body’s own words', () => {
    expect(refusalMessage({ errors: [{ message: 'No.' }] }, 'fallback', 504)).toBe('No.')
  })

  /** An HTML 504 from the proxy means the work may still be running. */
  it('advises waiting when a gateway answered with no readable body', () => {
    expect(refusalMessage(null, 'fallback', 504)).toBe(GATEWAY_REFUSAL)
    expect(refusalMessage(null, 'fallback', 524)).toBe(GATEWAY_REFUSAL)
    expect(refusalMessage(null, 'fallback', 500)).toBe('fallback')
  })
})
