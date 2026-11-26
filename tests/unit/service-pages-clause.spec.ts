import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { getProjectCollections, getProjectSlugs } from '@/plugins/access/config/projects'
import { PAGE_SERVICES_BY_PROJECT, servicePagesClause } from '@/plugins/access/servicePages'

/**
 * A request whose two configurations each place one tag: the website
 * `wisdom`, the app `technique`. `servicePagesWhere` itself is
 * `tests/unit/page-services.spec.ts`'s.
 */
function clientReq(roles: string[]): PayloadRequest {
  const tagFor: Record<string, string> = { 'wm-web-config': 'wisdom', 'wm-app-config': 'technique' }
  const findGlobal = vi.fn(async ({ slug }: { slug: string }) => ({ pageTags: [tagFor[slug]] }))
  return {
    context: {},
    user: { collection: 'clients', roles },
    payload: { findGlobal, config: { globals: [] } },
  } as unknown as PayloadRequest
}

const WEB = { tags: { in: ['wisdom'] } }

describe('servicePagesClause', () => {
  it('narrows a website key to the website’s pages', async () => {
    expect(await servicePagesClause(clientReq(['wemeditate-web-client']), 'pages')).toEqual(WEB)
  })

  // The app opens a page it does not carry at the page's webUrl, so it reads
  // the website's pages too — as one list, not a clause per service.
  it('narrows an app key to the app’s pages and the website’s', async () => {
    expect(await servicePagesClause(clientReq(['wemeditate-app-client']), 'pages')).toEqual({
      tags: { in: ['technique', 'wisdom'] },
    })
  })

  it('gives a key in both projects the union, once each', async () => {
    const req = clientReq(['wemeditate-web-client', 'wemeditate-app-client'])
    expect(await servicePagesClause(req, 'pages')).toEqual({
      tags: { in: ['wisdom', 'technique'] },
    })
  })

  it('adds nothing for another collection, a key in no page project, or a manager', async () => {
    expect(await servicePagesClause(clientReq(['wemeditate-web-client']), 'meditations')).toBeNull()
    expect(await servicePagesClause(clientReq(['sahaj-atlas-client']), 'pages')).toBeNull()
    const manager = { ...clientReq([]), user: { collection: 'managers' } } as PayloadRequest
    expect(await servicePagesClause(manager, 'pages')).toBeNull()
  })

  // Derived from the projects table in both directions: a project that lists
  // `pages` with no services would read every published page.
  it('names every project whose clients read pages', () => {
    const readsPages = getProjectSlugs().filter((p) => getProjectCollections(p).includes('pages'))
    expect(readsPages.sort()).toEqual(Object.keys(PAGE_SERVICES_BY_PROJECT).sort())
  })
})
