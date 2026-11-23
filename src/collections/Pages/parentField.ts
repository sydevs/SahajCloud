import type { RelationshipField, RelationshipFieldValidation } from 'payload'

import { relationship } from 'payload/shared'

import { relationId } from '@/lib/utilities/relationId'

import { homePageId } from './homePage'
import { PAGE_ANCESTOR_LIMIT, pageAncestry } from './webPath'

/**
 * The pages offered as a parent: every page but this one and the home page.
 *
 * A **descendant** passes this filter — no `Where` can express ancestry — so
 * {@link validateParent} walks the chain as well.
 */
const parentFilterOptions: RelationshipField['filterOptions'] = async ({ id, req }) => {
  const excluded = [id, await homePageId(req)].filter((value) => value != null)
  return excluded.length > 0 ? { id: { not_in: excluded } } : true
}

/**
 * Refuse a parent in words an editor can act on, where Payload answers
 * "invalid selection" for every one of these alike.
 *
 * ⚠ **The `relationship` tail is composed, never replaced.** Payload installs
 * its own validator only for a field that declares none, and that validator is
 * what applies `filterOptions` on save — so a field declaring both would narrow
 * the picker and enforce nothing, and an API `PATCH` naming any page id would be
 * accepted (`src/collections/AGENTS.md`).
 */
const validateParent: RelationshipFieldValidation = async (value, options) => {
  const parentId = relationId(value)
  const { event, id, previousValue, req } = options

  if (parentId !== null) {
    if (parentId === id) return 'A page cannot be its own parent.'

    // Payload's own relationship validator skips `validateFilterOptions` on an
    // `onChange` pass, and the walk below is dearer still: the admin re-requests
    // form state as the editor types, and none of it decides a save.
    if (event === 'onChange') return true

    // ⚠ **An unchanged parent is not this save's decision.** Payload re-runs
    // every validator on every save, and `validateFilterOptions`' own read
    // passes no `trash: true` — so re-judging a stored value made every page
    // under a trashed section unsaveable. The stored value was judged when it
    // was written; only a move is this save's to refuse.
    if (parentId === relationId(previousValue)) return true

    const homeId = await homePageId(req)
    if (parentId === homeId) {
      return 'The home page is the site root, so it cannot be a parent. Choose another page.'
    }
    // The root sits under nothing. `wm-web-config.homePage` refuses the other
    // ordering — naming a page that is already nested.
    if (id != null && id === homeId) {
      return 'The home page is the site root, so it cannot sit under another page.'
    }

    const { chain, stopped } = await pageAncestry(parentId, req)

    // Before `stopped`, because a chain looping back here stops as a loop, and
    // naming the page the editor picked is the more useful answer.
    if (id != null && chain.some((ancestor) => ancestor.id === id)) {
      return `“${chain[0]?.slug ?? parentId}” already sits under this page, so it cannot be its parent.`
    }
    if (stopped === 'depth') {
      return `A page may sit under at most ${PAGE_ANCESTOR_LIMIT} others, and this parent is already that deep.`
    }
    if (stopped === 'loop') {
      return 'This parent sits in a loop of parents, which has to be broken first.'
    }
    // `stopped === 'missing'` falls through: an id no page holds is what the
    // composed validator below refuses, in Payload's own words.
  }

  return relationship(value, {
    ...options,
    relationTo: 'pages',
    filterOptions: parentFilterOptions,
  } as never)
}

/**
 * A page's place in the content tree, and the first segments of its address.
 *
 * Optional: a page with no parent sits at the site root, which is every page
 * until an editor nests one.
 *
 * ⚠ **`nestedDocsPlugin` is not registered on `pages`, and must not be**
 * (`src/collections/AGENTS.md`).
 */
export const pageParentField: RelationshipField = {
  name: 'parent',
  type: 'relationship',
  relationTo: 'pages',
  // The path composer walks the chain itself, one memoized row at a time, so a
  // populated parent here would only re-read a row it already holds.
  maxDepth: 0,
  filterOptions: parentFilterOptions,
  validate: validateParent,
  admin: {
    position: 'sidebar',
    description: 'The page this one sits under. Its address becomes the start of this one’s.',
  },
}
