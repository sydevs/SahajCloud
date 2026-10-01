/**
 * Every collection in no project must be named in `RESTRICTED_COLLECTIONS`.
 *
 * ⚠ **"No project" reads as *shared*, not as restrictive.** Implicit read grants
 * every role — every published API key included — read on any collection no
 * project lists, so a collection holding personal data is exposed by being
 * forgotten rather than by being granted anything.
 *
 * `config/projects.ts` has carried that as prose, and the prose has been wrong
 * once already: its docblock said the list "fails open the day a fifth is
 * added", and when `event-imports` became the fifth (#828) nothing but the
 * comment asked for the entry. This is the gate that comment was describing. It
 * does not replace the per-collection read-back specs — `access.md` is explicit
 * that membership proves nothing on its own — it only makes the omission
 * impossible to ship silently.
 */
import { describe, expect, it } from 'vitest'

import { collections } from '@/collections'
import { getAllProjectCollections, isRestrictedCollection } from '@/plugins/access/config'
import type { ContentSlug } from '@/plugins/access/types'

/**
 * Collections that sit in no project and are deliberately world-readable.
 *
 * Empty today, and an entry needs a reason that outlives the next reader: the
 * default is that anything no project lists is restricted. `forms` is **not** a
 * candidate — it is listed by two projects, and its own `read: () => true` comes
 * from the form-builder plugin.
 */
const DELIBERATELY_SHARED: ReadonlySet<string> = new Set([])

describe('RESTRICTED_COLLECTIONS', () => {
  const inAProject = new Set<string>(getAllProjectCollections())
  const noProject = collections
    .map((collection) => collection.slug)
    .filter((slug) => !inAProject.has(slug))

  it('reads the real collection list, so a passing run means something', () => {
    // A `collections` import that resolved to nothing would make the sweep below
    // vacuous, and the whole point is that it fails on a collection nobody
    // remembered.
    expect(collections.length).toBeGreaterThan(20)
    expect(noProject.length).toBeGreaterThan(0)
  })

  it('names every registered collection that no project lists', () => {
    const unrestricted = noProject.filter(
      (slug) => !DELIBERATELY_SHARED.has(slug) && !isRestrictedCollection(slug as ContentSlug),
    )

    expect(unrestricted).toEqual([])
  })
})
