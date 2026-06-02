import type { CollectionAfterChangeHook } from 'payload'

import { extractID } from 'payload/shared'

import { updateIsParent } from './updateIsParent'

/**
 * afterChange hook: Maintain `isParent` flag when a tag's parent changes.
 * Updates both old and new parents.
 */
export const maintainIsParent: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  context,
  req,
}) => {
  // Prevent recursive triggers from updateIsParent calls
  if (context.skipIsParentHook) return doc

  const currentParentId = doc.parent ? extractID(doc.parent) : null
  const previousParentId = previousDoc?.parent ? extractID(previousDoc.parent) : null

  // If parent hasn't changed, nothing to do
  if (currentParentId === previousParentId) return doc

  // Update new parent's isParent flag
  if (currentParentId) {
    await updateIsParent(req, currentParentId)
  }

  // Update old parent's isParent flag
  if (previousParentId) {
    await updateIsParent(req, previousParentId)
  }

  return doc
}
