import type { ContentSlug } from './types'
import type { Access } from 'payload'

import { bypassPermissions } from './bypassPermissions'
import { hasPermission } from './permissions'

/**
 * Returns a read Access function that blocks API clients and delegates to RBAC for all others.
 * Composes with bypassPermissions so inactive managers remain denied (#341).
 */
export function denyApiClientReads(slug: ContentSlug): Access {
  return ({ req, id }) => {
    if (req.user?.collection === 'clients') return false
    return hasPermission(
      { user: req.user, collection: slug, operation: 'read', ...(id && { docId: id }) },
      bypassPermissions,
    )
  }
}
