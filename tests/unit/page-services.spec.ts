import type { FlattenedField, PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  loadServiceConfigOnce,
  pageServiceReasons,
  servicePagesFromConfig,
  servicePagesWhere,
} from '@/lib/pageServices'

/** Only the keys `servicePagesFromConfig` reads off a sanitized field. */
const field = (f: Record<string, unknown>) => f as unknown as FlattenedField

const FIELDS: FlattenedField[] = [
  field({ name: 'homePage', label: 'Home Page', type: 'relationship', relationTo: 'pages' }),
  field({ name: 'classPages', type: 'relationship', relationTo: 'pages', hasMany: true }),
  field({ name: 'audiences', type: 'relationship', relationTo: 'audiences', hasMany: true }),
  field({
    name: 'promo',
    type: 'group',
    flattenedFields: [field({ name: 'target', type: 'relationship', relationTo: 'pages' })],
  }),
  field({
    name: 'cards',
    type: 'array',
    flattenedFields: [
      field({ name: 'link', type: 'relationship', relationTo: ['pages', 'meditations'] }),
    ],
  }),
  field({ name: 'pageTags', type: 'select', hasMany: true }),
]

describe('servicePagesFromConfig', () => {
  const pages = servicePagesFromConfig(FIELDS, {
    homePage: 1,
    classPages: [2, { id: 3 }],
    audiences: [99],
    promo: { target: 1 },
    cards: [
      { link: { relationTo: 'pages', value: 4 } },
      { link: { relationTo: 'meditations', value: 5 } },
    ],
    pageTags: ['wisdom', 'subtle-system'],
  })

  it('collects every page a page field names, at any depth, with each field that names it', () => {
    expect(Object.fromEntries(pages.named)).toEqual({
      1: ['Home Page', 'Target'],
      2: ['Class Pages'],
      3: ['Class Pages'],
      4: ['Link'],
    })
  })

  it('ignores relationships to other collections', () => {
    expect(pages.named.has(99)).toBe(false)
    expect(pages.named.has(5)).toBe(false)
  })

  it('reads the tag list', () => {
    expect(pages.tags).toEqual(['wisdom', 'subtle-system'])
  })

  it('answers an empty set for an unsaved configuration', () => {
    const empty = servicePagesFromConfig(FIELDS, {})
    expect(empty.named.size).toBe(0)
    expect(empty.tags).toEqual([])
  })
})

describe('pageServiceReasons', () => {
  const pages = servicePagesFromConfig(FIELDS, { homePage: 1, pageTags: ['wisdom'] })

  it('names the fields first, then the listed tags the page carries', () => {
    expect(pageServiceReasons({ id: 1, tags: ['wisdom', 'event'] }, pages)).toEqual([
      'Home Page',
      'tagged "wisdom"',
    ])
  })

  it('is empty for a page neither named nor tagged with a listed tag', () => {
    expect(pageServiceReasons({ id: 7, tags: ['event'] }, pages)).toEqual([])
  })
})

describe('servicePagesWhere', () => {
  it('ORs the named ids with the listed tags', () => {
    const pages = servicePagesFromConfig(FIELDS, { classPages: [2, 3], pageTags: ['wisdom'] })
    expect(servicePagesWhere(pages)).toEqual({
      or: [{ id: { in: [2, 3] } }, { tags: { in: ['wisdom'] } }],
    })
  })

  it('keeps a single clause bare', () => {
    const pages = servicePagesFromConfig(FIELDS, { pageTags: ['wisdom'] })
    expect(servicePagesWhere(pages)).toEqual({ tags: { in: ['wisdom'] } })
  })

  // The fail-closed direction: an unconfigured website reads no page, rather
  // than every page.
  it('matches nothing for an unconfigured service', () => {
    expect(servicePagesWhere(servicePagesFromConfig(FIELDS, {}))).toEqual({
      id: { exists: false },
    })
  })
})

/**
 * `memoizeOnRequest`'s own contract — one load under concurrency, sequential
 * reuse, failure eviction, no sharing across requests — pinned against this
 * consumer (#542: a bulk publish fans the page's afterRead hooks across every
 * document concurrently).
 */
describe('loadServiceConfigOnce', () => {
  function makeReq(impl: () => Promise<Record<string, unknown>>) {
    const findGlobal = vi.fn((_args: { slug: string; depth?: number; req?: unknown }) => impl())
    const req = { context: {}, payload: { findGlobal } } as unknown as PayloadRequest
    return { req, findGlobal }
  }

  it('issues a single findGlobal when many callers race before it resolves', async () => {
    let resolve!: (v: Record<string, unknown>) => void
    const pending = new Promise<Record<string, unknown>>((r) => {
      resolve = r
    })
    const { req, findGlobal } = makeReq(() => pending)

    const inflight = Array.from({ length: 8 }, () => loadServiceConfigOnce(req, 'app'))
    resolve({ homePage: 1 })
    const results = await Promise.all(inflight)

    expect(findGlobal).toHaveBeenCalledTimes(1)
    expect(findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'wm-app-config', depth: 0 }),
    )
    results.forEach((r) => expect(r).toEqual({ homePage: 1 }))
  })

  // ⚠ The hooks run on a write's response inside its open transaction, and a
  // nested read that joins it can roll the write back.
  it('does not forward the caller’s req into the read', async () => {
    const { req, findGlobal } = makeReq(async () => ({}))
    await loadServiceConfigOnce(req, 'web')
    expect(findGlobal.mock.calls[0]?.[0]).not.toHaveProperty('req')
  })

  it('keeps each service’s load apart within one request', async () => {
    const { req, findGlobal } = makeReq(async () => ({}))
    await loadServiceConfigOnce(req, 'web')
    await loadServiceConfigOnce(req, 'web')
    await loadServiceConfigOnce(req, 'app')
    expect(findGlobal.mock.calls.map(([args]) => args.slug)).toEqual([
      'wm-web-config',
      'wm-app-config',
    ])
  })

  it('evicts a failed load so a later read in the request retries', async () => {
    let calls = 0
    const { req, findGlobal } = makeReq(() => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: true })
    })

    await expect(loadServiceConfigOnce(req, 'web')).rejects.toThrow('boom')
    await expect(loadServiceConfigOnce(req, 'web')).resolves.toEqual({ ok: true })
    expect(findGlobal).toHaveBeenCalledTimes(2)
  })

  it('does not share the load across requests', async () => {
    const a = makeReq(async () => ({ n: 'a' }))
    const b = makeReq(async () => ({ n: 'b' }))

    expect(await loadServiceConfigOnce(a.req, 'web')).toEqual({ n: 'a' })
    expect(await loadServiceConfigOnce(b.req, 'web')).toEqual({ n: 'b' })
    expect(a.findGlobal).toHaveBeenCalledTimes(1)
    expect(b.findGlobal).toHaveBeenCalledTimes(1)
  })
})
