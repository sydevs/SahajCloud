import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeValidateHook,
  Payload,
} from 'payload'

import { ValidationError } from 'payload'
import { extractID } from 'payload/shared'

/**
 * beforeValidate hook: Enforce single-level nesting constraints.
 *
 * Uses `originalDoc.isParent` to prevent a parent tag from becoming a child.
 * The reverse check (child can't be selected as parent) is handled by
 * Payload's built-in validateFilterOptions, which enforces filterOptions server-side.
 */
export const validateNesting: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
}) => {
  const parentValue = data?.parent
  if (!parentValue) return data

  // A tag that already has children cannot become a child
  if (operation === 'update' && originalDoc?.isParent) {
    throw new ValidationError({
      errors: [
        {
          message:
            'Cannot set a parent on a tag that already has children. Only single-level nesting is allowed.',
          path: 'parent',
        },
      ],
    })
  }

  return data
}

/**
 * Update the `isParent` flag on a tag based on whether it has children.
 * Uses `payload.count()` for efficiency and sets `isParent` accordingly.
 */
async function updateIsParent(payload: Payload, parentId: number | string): Promise<void> {
  const { totalDocs } = await payload.count({
    collection: 'meditation-tags',
    where: { parent: { equals: parentId } },
  })

  await payload.update({
    collection: 'meditation-tags',
    id: parentId,
    data: { isParent: totalDocs > 0 },
    context: { skipIsParentHook: true },
  })
}

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
    await updateIsParent(req.payload, currentParentId)
  }

  // Update old parent's isParent flag
  if (previousParentId) {
    await updateIsParent(req.payload, previousParentId)
  }

  return doc
}

/**
 * afterDelete hook: Update `isParent` flag when a tag is deleted.
 * Checks if the deleted tag's parent still has other children.
 */
export const clearIsParentOnDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const parentId = doc.parent ? extractID(doc.parent) : null

  if (parentId) {
    await updateIsParent(req.payload, parentId)
  }

  return doc
}
