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

import type { LocaleCode } from '@/lib/locales'

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
 * - Regular managers: See English + locales where they have roles assigned
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

  // Regular managers - English + locales with roles
  const roles = authUser.roles

  // If roles is not a localized object, return only English
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) {
    return [englishLocale]
  }

  // Roles is a localized object
  const localizedRoles = roles as Record<LocaleCode, string[]>

  // Find all locales where the manager has at least one role
  const localesWithRoles = Object.keys(localizedRoles).filter(
    (locale) => localizedRoles[locale as LocaleCode]?.length > 0,
  )

  // Return English (always) + locales where manager has roles
  return locales.filter((l) => l.code === 'en' || localesWithRoles.includes(l.code))
}
