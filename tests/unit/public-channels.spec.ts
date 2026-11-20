/**
 * The page channel clause (#783).
 *
 * `publicChannelClause` takes a request and answers a `Where`, so the whole
 * mapping from a client's roles to the columns it may read is testable with no
 * database. `tests/int/pages-public-channels.int.spec.ts` proves the wiring —
 * that `createAccessConfig` ANDs this with the published-only clause and that a
 * real read is narrowed. The matrix lives here.
 */
import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { publicChannelClause } from '@/plugins/access/publicChannels'

const clientReq = (roles: string[]): PayloadRequest =>
  ({ user: { id: 1, collection: 'clients', roles } }) as unknown as PayloadRequest

const managerReq = (): PayloadRequest =>
  ({ user: { id: 1, collection: 'managers', type: 'admin' } }) as unknown as PayloadRequest

describe('publicChannelClause', () => {
  it('narrows a web client to pages published to the website', () => {
    expect(publicChannelClause(clientReq(['wemeditate-web-client']), 'pages')).toEqual({
      publishedToWeb: { equals: true },
    })
  })

  it('narrows an app client to pages published to the app', () => {
    expect(publicChannelClause(clientReq(['wemeditate-app-client']), 'pages')).toEqual({
      publishedToApp: { equals: true },
    })
  })

  it('gives a client holding both roles the union, not the intersection', () => {
    expect(
      publicChannelClause(clientReq(['wemeditate-web-client', 'wemeditate-app-client']), 'pages'),
    ).toEqual({
      or: [{ publishedToWeb: { equals: true } }, { publishedToApp: { equals: true } }],
    })
  })

  it('collapses a role listed twice to a single clause', () => {
    expect(
      publicChannelClause(clientReq(['wemeditate-web-client', 'wemeditate-web-client']), 'pages'),
    ).toEqual({ publishedToWeb: { equals: true } })
  })

  /**
   * `null` means "add nothing", never "allow nothing". Each of these callers
   * reaches `pages` under the rules that already govern it — the atlas client
   * through a refusal `hasPermission` has already made, since `sahaj-atlas`
   * does not name the collection.
   */
  it.each([
    ['a client holding no channel role', clientReq(['sahaj-atlas-client']), 'pages'],
    ['a client holding no roles at all', clientReq([]), 'pages'],
    ['another collection', clientReq(['wemeditate-web-client']), 'meditations'],
    ['a manager', managerReq(), 'pages'],
  ])('adds nothing for %s', (_label, req, collection) => {
    expect(publicChannelClause(req, collection)).toBeNull()
  })

  it('adds nothing for an anonymous request', () => {
    expect(publicChannelClause({} as PayloadRequest, 'pages')).toBeNull()
  })

  it('tolerates a client row with no roles array', () => {
    const req = { user: { id: 1, collection: 'clients' } } as unknown as PayloadRequest
    expect(publicChannelClause(req, 'pages')).toBeNull()
  })
})
