/**
 * Filter available locales in admin UI based on user permissions
 *
 * This function is used by PayloadCMS to filter which locales are shown
 * in the locale selector based on the authenticated user's roles.
 */

import type { TypedManager } from './types'
import type { Locale, PayloadRequest } from 'payload'

import type { LocaleCode } from '@/lib/locales'

import { isAPIClient } from './permissions'

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

  // API clients - not filtered (return all locales)
  // filterAvailableLocales only applies to admin UI, which API clients don't use
  if (isAPIClient(req.user)) return locales

  const manager = req.user as TypedManager

  // Inactive managers - return only English
  if (manager.type === 'inactive') return [englishLocale]

  // Admin managers - return all locales
  if (manager.type === 'admin') return locales

  // Regular managers - English + locales with roles
  const roles = manager.roles as Record<LocaleCode, string[]> | undefined

  // If roles is not a localized object, return only English
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) {
    return [englishLocale]
  }

  // Find all locales where the manager has at least one role
  const localesWithRoles = Object.keys(roles).filter(
    (locale) => roles[locale as LocaleCode]?.length > 0,
  )

  // Return English (always) + locales where manager has roles
  return locales.filter((l) => l.code === 'en' || localesWithRoles.includes(l.code))
}
