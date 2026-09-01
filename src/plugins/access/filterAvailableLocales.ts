/**
 * Filter available locales in admin UI based on user permissions
 *
 * This function is used by PayloadCMS to filter which locales are shown
 * in the locale selector based on the authenticated user's roles.
 *
 * Generic Implementation: Works with any auth collection.
 */

import type { TypedAuthUser } from './types'
import type { Locale, PayloadRequest } from 'payload'

import { normalizeLocalizedRoles, rankLocalesByRoleCount } from './localizedRoles'

type FilterAvailableLocalesArgs = {
  locales: Locale[]
  req: PayloadRequest
}

/**
 * Filter available locales based on user permissions
 *
 * - Unauthenticated requests: Return only English (for login page)
 * - Admin managers: See all locales
 * - API clients: Not filtered (return all locales)
 * - Regular managers: exactly the locales they hold a role in, most roles first
 * - Managers with roles in no locale: English only
 * - Inactive managers: Return only English
 *
 * @param args - Arguments containing locales array and request
 * @returns Filtered array of locales
 */
export const filterAvailableLocales = ({
  locales,
  req,
}: FilterAvailableLocalesArgs): Locale[] => {
  const englishLocale = locales.find((l) => l.code === 'en')!

  // Unauthenticated - return only English (for login page)
  if (!req.user) return [englishLocale]

  const authUser = req.user as TypedAuthUser

  // API clients - not filtered (return all locales)
  // filterAvailableLocales only applies to admin UI, which API clients don't use
  if (authUser.collection === 'clients') return locales

  // The rest of the logic is manager-specific

  // Inactive managers - return only English
  if (authUser.type === 'inactive') return [englishLocale]

  // Admin managers - return all locales
  if (authUser.type === 'admin') return locales

  // Regular managers — exactly the locales they hold a role in, best first.
  //
  // English is NOT force-added. It used to be, which made the dropdown claim
  // access the manager did not have and — because `localeCodes[0]` is also where
  // Payload lands them — pinned every manager to a locale their roles might not
  // cover. Dropping it is what activates `@payloadcms/next`'s own redirect to
  // `localeCodes[0]` for a manager whose active locale grants them nothing.
  const ranked = rankLocalesByRoleCount(normalizeLocalizedRoles(authUser.roles))

  // ⚠ Never return an empty array. `views/Root` redirects whenever `req.locale` is
  // not in this list and sends the manager to `localeCodes[0]`; when that is
  // `undefined`, `qs.stringify` drops the key and the route redirects to itself —
  // an infinite loop. English is also what keeps the "No Projects Available"
  // banner reachable, which is the correct outcome for a manager with no roles.
  if (ranked.length === 0) return [englishLocale]

  // Ordered by the ranking, not by the config's locale order: the first entry is
  // both the first dropdown item and the locale Payload lands them on.
  return ranked
    .map((code) => locales.find((l) => l.code === code))
    .filter((l): l is Locale => Boolean(l))
}
