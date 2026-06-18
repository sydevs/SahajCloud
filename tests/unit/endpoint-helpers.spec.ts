import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { parseQuery, requireActiveClient } from '@/lib/endpoints'

/** Build a minimal `req` stub carrying just the fields the helpers read. */
const reqWith = (parts: Partial<PayloadRequest>): PayloadRequest =>
  parts as unknown as PayloadRequest

describe('requireActiveClient', () => {
  it('returns a 403 with the canonical body when there is no user', async () => {
    const denied = requireActiveClient(reqWith({ user: null }))
    expect(denied).toBeInstanceOf(Response)
    expect(denied?.status).toBe(403)
    expect(await denied?.json()).toEqual({
      errors: [{ message: 'You are not allowed to perform this action.' }],
    })
  })

  it('returns a 403 when the user is not from the clients collection', () => {
    const denied = requireActiveClient(reqWith({ user: { collection: 'managers' } as never }))
    expect(denied?.status).toBe(403)
  })

  it('returns a 403 when the client is a draft (unpublished)', () => {
    const denied = requireActiveClient(
      reqWith({ user: { collection: 'clients', _status: 'draft' } as never }),
    )
    expect(denied?.status).toBe(403)
  })

  it('fails closed when _status is absent (403)', () => {
    // Guards against a missing/unhydrated _status silently granting access:
    // anything other than exactly 'published' must be denied.
    const denied = requireActiveClient(reqWith({ user: { collection: 'clients' } as never }))
    expect(denied?.status).toBe(403)
  })

  it('returns null for a published client', () => {
    const denied = requireActiveClient(
      reqWith({ user: { collection: 'clients', _status: 'published' } as never }),
    )
    expect(denied).toBeNull()
  })
})

describe('parseQuery', () => {
  const schema = z.object({ limit: z.coerce.number().int().min(1) })

  it('returns ok with the parsed (coerced) data on a valid query', () => {
    const result = parseQuery(reqWith({ query: { limit: '5' } }), schema)
    expect(result).toEqual({ ok: true, data: { limit: 5 } })
  })

  it('returns a 400 carrying the Zod issues on an invalid query', async () => {
    const result = parseQuery(reqWith({ query: { limit: 'nope' } }), schema)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected parse failure')
    expect(result.response.status).toBe(400)
    const body = (await result.response.json()) as { errors: unknown[] }
    expect(Array.isArray(body.errors)).toBe(true)
    expect(body.errors.length).toBeGreaterThan(0)
  })
})
