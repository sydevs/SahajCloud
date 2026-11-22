/**
 * A website key reads only the pages the website's configuration places — a
 * page field naming it, or a tag it lists — across a `find`, a `findByID` and
 * a populated relationship. The app's key is not narrowed. The pure rules are
 * `tests/unit/page-services.spec.ts`; `docs/rules/access.md` carries the rule.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Page } from '@/payload-types'

import { placePages } from '../utils/servicePages'
import { testData } from '../utils/testData'
import {
  createClientAuthenticatedRequest,
  createTestEnvironment,
  idOnlySelect,
} from '../utils/testHelpers'

describe('the pages a website key reads', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminId: number

  let named: Page
  let tagged: Page
  let unplaced: Page
  let taggedDraft: Page

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminId = testEnv.adminUser.id

    named = await testData.createPage(payload, { title: 'Named Page', _status: 'published' })
    tagged = await testData.createPage(payload, {
      title: 'Tagged Page',
      tags: ['wisdom'],
      _status: 'published',
    })
    unplaced = await testData.createPage(payload, {
      title: 'App Only Page',
      tags: ['technique'],
      _status: 'published',
    })
    taggedDraft = await testData.createPage(payload, { title: 'Tagged Draft', tags: ['wisdom'] })

    await placePages(payload, 'web', { pages: [named.id], tags: ['wisdom'] })
  })

  afterAll(async () => {
    await cleanup()
  })

  /** A client request holding `roles`, as the access functions read it. */
  async function clientReq(roles: string[]): Promise<Partial<PayloadRequest>> {
    const client = await testData.createClient(payload, adminId, { roles: roles as never })
    return createClientAuthenticatedRequest(client.id, 'unused-in-local-api', roles)
  }

  const findIds = async (req: Partial<PayloadRequest>) => {
    const result = await payload.find({
      collection: 'pages',
      depth: 0,
      limit: 100,
      select: idOnlySelect(),
      overrideAccess: false,
      req: req as never,
    })
    return result.docs.map((doc) => doc.id)
  }

  it('finds the pages the website names or tags, and no other', async () => {
    const ids = await findIds(await clientReq(['wemeditate-web-client']))

    expect(ids).toEqual(expect.arrayContaining([named.id, tagged.id]))
    expect(ids).not.toContain(unplaced.id)
  })

  it('still reads only published pages', async () => {
    const ids = await findIds(await clientReq(['wemeditate-web-client']))
    expect(ids).not.toContain(taggedDraft.id)
  })

  it('answers Not Found for a page the website does not place', async () => {
    const req = await clientReq(['wemeditate-web-client'])
    const read = (id: number) =>
      payload.findByID({
        collection: 'pages',
        id,
        depth: 0,
        select: idOnlySelect(),
        overrideAccess: false,
        req: req as never,
      })

    await expect(read(tagged.id)).resolves.toMatchObject({ id: tagged.id })
    await expect(read(unplaced.id)).rejects.toThrow('Not Found')
  })

  // The shape WeMeditateWeb's `partitionPublishedPages` already discards.
  it('hands a populated relationship to such a page back as its bare id', async () => {
    const node = await testData.createSubtleSystemNode(payload, { page: unplaced.id })
    const req = await clientReq(['wemeditate-web-client'])

    const read = await payload.findByID({
      collection: 'subtle-system-nodes',
      id: node.id,
      depth: 1,
      select: { page: true },
      overrideAccess: false,
      req: req as never,
    })

    expect(read.page).toBe(unplaced.id)
  })

  it('leaves the app key unnarrowed, and a key in both projects too', async () => {
    for (const roles of [
      ['wemeditate-app-client'],
      ['wemeditate-web-client', 'wemeditate-app-client'],
    ]) {
      expect(await findIds(await clientReq(roles))).toContain(unplaced.id)
    }
  })
})
