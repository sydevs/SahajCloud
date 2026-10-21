import type { PermissionCheckArgs } from './types'
import type { PayloadRequest } from 'payload'


import { hasPermission } from './accessPlugin'
import { bypassPermissions } from './bypassPermissions'
import { roleScopeFromLocale } from './localizedRoles'

/**
 * Whether this request's user holds one collection operation **by their
 * roles**, in the locale the request names.
 *
 * The boolean behind `requireCollectionPermission` (`@/lib/endpoints`), for a
 * caller with no 403 envelope to return — a collection hook deciding whether a
 * write is one its author is authorised to make. Both read the locale scope
 * from here, so there is one owner of it (#701, #665): a request naming no
 * locale resolves to the **default** locale, and a manager whose roles live
 * only elsewhere is then denied. `roleScopeFromLocale` is also what refuses
 * `all` and stops a request naming `union`.
 *
 * ⚠ **Role grants only, and that is the point.** A collection's own `update`
 * is wider: when these grants deny, `createAccessConfig` falls back to
 * document-level manager access, so a manager merely *named* on a row holds
 * `update` on it with no grant at all (`accessConfigs.ts`). That is right for
 * editing the row and wrong for a privileged decision taken through it — a
 * hook asking "may this user decide" must not read the collection's `update`,
 * or being assigned a row becomes authority over what accepting it writes.
 */
export function holdsCollectionPermission(args: {
  req: PayloadRequest
  collection: PermissionCheckArgs['collection']
  operation: PermissionCheckArgs['operation']
}): boolean {
  const { req, collection, operation } = args

  return hasPermission(
    { user: req.user, collection, operation, locale: roleScopeFromLocale(req.locale) },
    bypassPermissions,
  )
}
