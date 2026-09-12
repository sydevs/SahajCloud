import type { CollectionBeforeOperationHook, Where } from 'payload'

import { isVersionsRead } from '@/lib/utilities/versionsRead'

/**
 * beforeOperation hook that filters meditations by their `locale` select field.
 *
 * Unlike other collections that use PayloadCMS's field-level localization,
 * each meditation document belongs to a single locale via its `locale` field.
 * This hook adds a `where` clause to filter meditations by their locale
 * when `find` or `count` operations include a locale parameter.
 *
 * Skipped for:
 * - versions reads (`findVersions`, `findVersionByID`) — Payload maps those onto
 *   the same `read` hook operation, but `locale` is not a queryable path on the
 *   versions collection, so appending the filter there 400s every caller,
 *   `overrideAccess: true` included (#745). See `isVersionsRead`.
 * - `findByID` operations (always return the specific document)
 * - `locale=all` requests (return all locales)
 * - Non-read operations (create, update, delete, etc.)
 */
export const filterMeditationsByLocale: CollectionBeforeOperationHook = ({ operation, args }) => {
  // A versions read arrives as `read` too, and cannot carry this filter.
  // Checked first so `operation` is still the full hook-operation union here.
  if (isVersionsRead(operation, args)) {
    return args
  }

  // Only filter find, count, and deprecated 'read' operations
  if (operation !== 'find' && operation !== 'count' && operation !== 'read') {
    return args
  }

  const locale = args.req?.locale

  // Skip filtering when locale is 'all' or not specified
  if (!locale || locale === 'all') {
    return args
  }

  // For deprecated 'read' operation, args could be find or findByID.
  // findByID args have an `id` property — skip filtering for those.
  if ('id' in args) {
    return args
  }

  // Build locale filter
  const localeFilter: Where = { locale: { equals: locale } }

  // Merge with existing where clause using AND logic
  const existingWhere = args.where
  if (existingWhere && Object.keys(existingWhere).length > 0) {
    args.where = {
      and: [existingWhere, localeFilter],
    }
  } else {
    args.where = localeFilter
  }

  return args
}
