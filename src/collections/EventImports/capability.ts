/**
 * Whether a caller may stage an import at all, asked in one place.
 *
 * ⚠ **The Import tab and the upload endpoint have to agree.** A tab offered to a
 * manager the endpoint then refuses is a volunteer filling in a CSV for a 403; a
 * tab withheld from one it would admit hides the feature from the person it was
 * built for. Both ask this, and nothing else answers it.
 *
 * ⚠ **The grant is read for one locale, never for all of them.** `roles` is
 * localized, so a manager who coordinates in German holds nothing in English
 * (#701). Each caller passes the locale its own request named — `req.locale` for
 * the endpoint, the admin locale the tab is rendered in.
 *
 * This is the capability half only. Whether the *target region* is one this
 * caller may import into is `refuseUnownedTarget` plus the level check
 * (`batchRequest.ts`, `propose/tree.ts`), both of which need the database.
 */

import type { TypedUser } from 'payload'

import { bypassPermissions, hasPermission, roleScopeFromLocale } from '@/plugins/access'

/**
 * What a caller refused by {@link mayStageImport} is told, in both surfaces that
 * ask it. Names the language rather than the role, because that is the half a
 * volunteer can act on — switching the admin locale is what fixes it.
 */
export const STAGE_IMPORT_REFUSAL = 'You are not allowed to create classes in this language.'

export function mayStageImport({
  user,
  locale,
}: {
  user: TypedUser | null | undefined
  locale: string | undefined
}): boolean {
  // ⚠ **The collection check is load-bearing, not a tidy-up.** A published API
  // client carrying a role with `events: create` would pass `hasPermission`, and
  // an import is an admin-panel action by a person. This is what
  // `requireActiveManager` does for the endpoint, restated because the tab
  // condition has no Response to return. An `inactive` manager is already denied
  // by `bypassPermissions`.
  if (user?.collection !== 'managers') return false

  return hasPermission(
    { user, collection: 'events', operation: 'create', locale: roleScopeFromLocale(locale) },
    bypassPermissions,
  )
}
