/**
 * Implicit read follows project membership, and a collection in no project
 * fails closed.
 *
 * It used to be the opposite: "no project" read as shared, and an opt-out list
 * kept personal data out of that rule. The list named every project-less
 * collection, so nothing failed — and the next collection added would have been
 * readable by every published API key. These cases pin the inverted default
 * against the real config, so a new project-less collection is covered the day
 * it is registered.
 */

import type { ContentSlug } from '../../src/plugins/access/types'

import { describe, expect, it } from 'vitest'

import { hasPermission } from '../../src/plugins/access'
import {
  getAllProjectCollections,
  getProjectCollections,
  getProjectSlugs,
  isImplicitlyReadable,
} from '../../src/plugins/access/config'
import { testData } from '../utils/testData'

/** The config import alone exceeds vitest's 5 s default. */
const TIMEOUT = 60_000

async function projectlessCollections(): Promise<ContentSlug[]> {
  const { default: config } = await import('@/payload.config')
  const inProject = new Set<string>(getAllProjectCollections())
  return (await config).collections
    .map((collection) => collection.slug)
    .filter((slug) => !slug.startsWith('payload-') && !inProject.has(slug)) as ContentSlug[]
}

describe('implicit read', () => {
  it(
    'reaches no project-less collection, from any project or none',
    async () => {
      const slugs = await projectlessCollections()
      expect(slugs.length).toBeGreaterThan(0)
      for (const slug of slugs) {
        for (const project of [...getProjectSlugs(), undefined]) {
          expect(isImplicitlyReadable(slug, project), `${slug} from ${project}`).toBe(false)
        }
      }
    },
    TIMEOUT,
  )

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
