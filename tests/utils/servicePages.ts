import type { Payload } from 'payload'

import { PAGE_SERVICES, type PageService } from '@/lib/pageServices'
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
 * too, which no caller asks about. The named pages go in `featuredPages` on the
 * website and `privacyPage` on the app, which holds one.
 */
export async function placePages(
  payload: Payload,
  service: PageService,
  { pages = [], tags = [] }: { pages?: number[]; tags?: PageTag[] },
): Promise<void> {
  const { slug } = PAGE_SERVICES[service]

  let placeholder = placeholders.get(payload)
  if (!placeholder) {
    placeholder = testData
      .createPage(payload, { title: 'Configuration placeholder' })
      .then((p) => p.id)
    placeholders.set(payload, placeholder)
  }
  const placeholderId = await placeholder

  const global = payload.globals.config.find((g) => g.slug === slug)
  const required = Object.fromEntries(
    (global?.flattenedFields ?? [])
      .filter((f) => f.type === 'relationship' && f.relationTo === 'pages' && f.required)
      .map((f) => [f.name, 'hasMany' in f && f.hasMany ? [placeholderId] : placeholderId]),
  )
  const named =
    service === 'web' ? { featuredPages: pages } : pages.length ? { privacyPage: pages[0] } : {}
  const data = { ...required, ...named, pageTags: tags }

  const existing = await payload.db.findGlobal({ slug })
  if (existing?.id) await payload.db.updateGlobal({ slug, data })
  else await payload.db.createGlobal({ slug, data })
}
