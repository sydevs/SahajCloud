import type { CollectionSlug } from 'payload'

import { formatAdminURL } from 'payload/shared'

import { getServerUrl } from '@/lib/utilities/serverUrl'

/**
 * Absolute URL of an admin-panel path.
 *
 * `formatAdminURL` is Payload's own joiner, so a `NEXT_BASE_PATH` deploy keeps
 * working and the segment rules stay Payload's to change. `adminRoute` mirrors
 * the default this config never overrides — `routes.admin` is unset in
 * `payload.config.ts`, and Payload's own default is `/admin`.
 *
 * Only a URL that leaves the app — an email, a redirect target — needs this.
 * An in-panel `href` stays relative: Next prepends `basePath` itself, which is
 * why Payload defaults `includeBasePath` to false once `adminRoute` is given.
 */
export function adminUrl(path: `/${string}`): string {
  return formatAdminURL({
    adminRoute: '/admin',
    path,
    serverURL: getServerUrl(),
  })
}

/** Absolute URL of a document's admin edit page. */
export function adminDocUrl(collection: CollectionSlug, id: number | string): string {
  return adminUrl(`/collections/${collection}/${id}`)
}
