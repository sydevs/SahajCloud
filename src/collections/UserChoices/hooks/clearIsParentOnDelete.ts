import type { CollectionAfterDeleteHook } from 'payload'

import { extractID } from 'payload/shared'

import { updateIsParent } from './updateIsParent'

/**
 * afterDelete hook: Update `isParent` flag when a tag is deleted.
 * Checks if the deleted tag's parent still has other children.
 */
export const clearIsParentOnDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const parentId = doc.parent ? extractID(doc.parent) : null

  if (parentId) {
    await updateIsParent(req, parentId)
  }

  return doc
}
