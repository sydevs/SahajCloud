/**
 * Active-route helpers for the Atlas sidebar, matching Payload's own nav rule
 * (`DefaultNavClient`): a link is active when the pathname is its href or a
 * sub-path of it.
 */

/** True when `pathname` is `href` or a path nested under it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])
}

/** The numeric doc id of the open `/collections/<slug>/<id>` page, or null. */
export function activeDocId(pathname: string, collectionSlug: string): number | null {
  const match = pathname.match(new RegExp(`/collections/${collectionSlug}/(\\d+)(?:/|$)`))
  return match ? Number(match[1]) : null
}
