import type { CollectionBeforeValidateHook } from 'payload'

import { ValidationError } from 'payload'

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
