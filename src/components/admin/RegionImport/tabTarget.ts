/**
 * Where the Import tab points, and whether it points anywhere at all.
 *
 * Pure, so the one decision a tab can make about the region being edited is
 * testable without a browser: `ImportTabLink` is hooks all the way down, and the
 * answer below is the only thing in it worth pinning.
 */

import { formatAdminURL } from 'payload/shared'

export interface ImportTabTargetArgs {
  readonly adminRoute: string
  readonly collectionSlug: string | undefined
  readonly id: number | string | undefined
  /** The region's saved `level`, or null while there is none to read. */
  readonly level: string | null
  /** The levels a batch may target. */
  readonly levels: readonly string[]
  /** The view's `path`, as Payload hands it to a tab component. */
  readonly path: string
  /** The locale the editor is reading in, carried over so the tab keeps it. */
  readonly locale: string | null
}

/**
 * The tab's href, or `null` for a region no batch can target.
 *
 * A level the caller could not read hides the tab too, and the list answers that
 * on its own — `includes(null)` is false. The `null` arm below is there for the
 * type-checker, not as a second check, so deleting it is a compile error rather
 * than a silent widening.
 */
export function importTabTarget({
  adminRoute,
  collectionSlug,
  id,
  level,
  levels,
  locale,
  path,
}: ImportTabTargetArgs): { href: string; hrefWithLocale: string } | null {
  if (!id || !collectionSlug || level === null || !levels.includes(level)) return null

  const href = formatAdminURL({
    adminRoute,
    path: `/collections/${collectionSlug}/${id}${path}`,
  })
  return { href, hrefWithLocale: locale ? `${href}?locale=${locale}` : href }
}
