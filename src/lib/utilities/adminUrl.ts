import type { CollectionSlug } from 'payload'

import { getServerUrl } from '@/lib/utilities/serverUrl'

/** Absolute URL of a document's admin edit page. */
export function adminDocUrl(collection: CollectionSlug, id: number | string): string {
  return `${getServerUrl()}/admin/collections/${collection}/${id}`
}
