import type { CollectionSlug } from 'payload'

import { formatAdminURL } from 'payload/shared'

import { getServerUrl } from '@/lib/utilities/serverUrl'

/**
 * Absolute URL of a document's admin edit page.
 *
 * `formatAdminURL` is Payload's own joiner, so a `NEXT_BASE_PATH` deploy keeps
 * working and the segment rules stay Payload's to change. `adminRoute` mirrors
 * the default this config never overrides — `routes.admin` is unset in
 * `payload.config.ts`, and Payload's own default is `/admin`.
 */
export function adminDocUrl(collection: CollectionSlug, id: number | string): string {
  return formatAdminURL({
    adminRoute: '/admin',
    path: `/collections/${collection}/${id}`,
    serverURL: getServerUrl(),
  })
}
