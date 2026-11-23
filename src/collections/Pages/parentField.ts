import type { PayloadRequest, RelationshipField, RelationshipFieldValidation } from 'payload'

import { relationship } from 'payload/shared'

import { relationId } from '@/lib/utilities/relationId'

import { homePageId } from './homePage'
import { PAGE_ANCESTOR_LIMIT, pageAncestry } from './webPath'

/**
 * The pages offered as a parent: every page but this one and the home page.
 *
 * A **descendant** passes this filter — no `Where` can express ancestry — so
 * {@link describeRefusal} walks the chain as well.
 */
const parentFilterOptions: RelationshipField['filterOptions'] = async ({ id, req }) => {
  const excluded = [id, await homePageId(req)].filter((value) => value != null)
  return excluded.length > 0 ? { id: { not_in: excluded } } : true
}

/**
 * Why this parent cannot be saved, in words an editor can act on, or
 * `undefined` to leave the answer to the composed validator below.
 *
 * Payload refuses every one of these as "invalid selection", which says nothing
 * about which of the page's own relatives it was handed.
 */
async function describeRefusal(
  value: unknown,
  options: { id?: number | string; req: PayloadRequest },
): Promise<string | undefined> {
  const parentId = relationId(value)
  if (parentId === null) return undefined

  const { id, req } = options
  if (parentId === id) return 'A page cannot be its own parent.'
  if (parentId === (await homePageId(req))) {
    return 'The home page is the site root, so it cannot be a parent. Choose another page.'
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

  // `missing` is left to the composed validator below, which refuses an id no
  // page holds in Payload's own words.
  return undefined
}

/**
 * ⚠ **Composed, never replaced.** Payload installs its own `relationship`
 * validator only for a field that declares none, and that validator is what
 * applies `filterOptions` on save — so a field declaring both would narrow the
 * picker and enforce nothing, and an API `PATCH` naming any page id would be
 * accepted (`src/collections/AGENTS.md`).
 */
const validateParent: RelationshipFieldValidation = async (value, options) => {
  const refusal = await describeRefusal(value, options)
  if (refusal) return refusal

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
 * ⚠ **`nestedDocsPlugin` is not registered on `pages`, and must not be.** It
 * appends `resaveChildren` unconditionally, which cascades on every publish and
 * reads a `{locale: status}` map as a draft — so a parent's save would publish
 * a descendant's pending translation. Regions carry the plugin because Regions
 * have no drafts.
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
