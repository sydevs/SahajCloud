/**
 * Implicit read follows project membership, and a collection in no project
 * fails closed (`docs/rules/access.md`).
 */

import type { ContentSlug } from '../../src/plugins/access/types'

import { describe, expect, it } from 'vitest'

import { hasPermission } from '../../src/plugins/access'
import {
  getProjectCollections,
  getProjectSlugs,
  isImplicitlyReadable,
} from '../../src/plugins/access/config'
import { testData } from '../utils/testData'

describe('implicit read', () => {
  it('refuses a collection nobody has placed yet', () => {
    expect(isImplicitlyReadable('brand-new-collection' as ContentSlug, 'sahaj-atlas')).toBe(false)
  })

  it('reaches every collection a project names, from that project alone', () => {
    for (const project of getProjectSlugs()) {
      for (const slug of getProjectCollections(project)) {
        expect(isImplicitlyReadable(slug, project), `${slug} from ${project}`).toBe(true)
      }
    }
    expect(isImplicitlyReadable('events', 'wemeditate-web')).toBe(false)
  })

  it('is what hasPermission applies to a published client key', () => {
    const atlasClient = testData.dummyUser('clients', { id: 1, roles: ['sahaj-atlas-client'] })
    const read = (collection: ContentSlug) =>
      hasPermission({ user: atlasClient, collection, operation: 'read' })

    expect(read('events')).toBe(true)
    expect(read('user-submissions')).toBe(false)
    expect(read('managers')).toBe(false)
  })
})
