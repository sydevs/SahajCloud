import type { Payload, RelationshipField } from 'payload'

import { PAGE_SERVICE_GLOBALS, type PageService } from '@/lib/pageServices'
import type { PageTag } from '@/lib/pageTags'

import { testData } from './testData'

const placeholders = new WeakMap<Payload, Promise<number>>()

/**
 * Place pages in a service the way its configuration would: by naming them in
 * one of its page fields, or by listing tags. Replaces what the service placed
 * before.
 *
 * Written beneath validation, because both configurations demand fields that
 * are beside the point of every caller. Their required page columns are still
 * `NOT NULL`, so each holds one placeholder page per suite — a page this places
 * too, which no caller asks about. The named pages go in the configuration's
 * first list of pages, so the app, which has none, takes tags only.
 *
 * Setup only: it proves what placement derives, never the configuration's own
 * validation or the cache purge on its save.
 */
export async function placePages(
  payload: Payload,
  service: PageService,
  { pages = [], tags = [] }: { pages?: number[]; tags?: PageTag[] },
): Promise<void> {
  const slug = PAGE_SERVICE_GLOBALS[service]

  let placeholder = placeholders.get(payload)
  if (!placeholder) {
    placeholder = testData
      .createPage(payload, { title: 'Configuration placeholder' })
      .then((p) => p.id)
    placeholders.set(payload, placeholder)
  }
  const placeholderId = await placeholder

  const pageFields = (
    payload.globals.config.find((g) => g.slug === slug)?.flattenedFields ?? []
  ).filter((f): f is RelationshipField => f.type === 'relationship' && f.relationTo === 'pages')
  const required = Object.fromEntries(
    pageFields
      .filter((f) => f.required)
      .map((f) => [f.name, f.hasMany ? [placeholderId] : placeholderId]),
  )
  const list = pageFields.find((f) => f.hasMany)
  if (pages.length && !list) throw new Error(`${slug} has no list of pages to name them in`)
  const data = { ...required, ...(list ? { [list.name]: pages } : {}), pageTags: tags }

  const existing = await payload.db.findGlobal({ slug })
  if (existing?.id) await payload.db.updateGlobal({ slug, data })
  else await payload.db.createGlobal({ slug, data })
}
