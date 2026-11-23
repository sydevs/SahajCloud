import { toWords } from 'payload/shared'

import { APP_PAGE_FIELDS } from '@/globals/WeMeditateAppConfig/WeMeditateAppConfig'
import { labelOf, refId, type DocumentReport, type SectionSpec } from '@/lib/status'
import { richTextHasContent } from '@/lib/status/helpers'

import {
  getWmAppConfig,
  isolatedReq,
  readFallbackTitles,
  type WeMeditateAppStatusConfig,
} from './shared'

interface Ctx {
  coreDocs: DocumentReport[]
  nodeDocs: DocumentReport[]
}

/** A configured page reference, and how to name it when no page is behind it. */
interface PageSlot {
  id: number | string | null
  label: string
}

/**
 * `required` is only checked on save, so a slot can name a trashed page, or
 * none once its page is deleted. Either still gets a failing row (#1252), with
 * a string id so the row doesn't link to a document that won't open.
 */
function reportForSlot(
  pagesById: Map<number | string, Record<string, unknown>>,
  { id, label }: PageSlot,
): DocumentReport {
  const page = id === null ? undefined : pagesById.get(id)
  return {
    id: page ? (page.id as number | string) : `missing:${label}`,
    label: page
      ? labelOf(page as { id: number | string; title?: unknown })
      : `${label} — ${id === null ? 'not set' : `page ${id} not found`}`,
    checks: [
      { key: 'exists', passed: page !== undefined },
      { key: 'published', passed: page?._status === 'published' },
      { key: 'content-localized', passed: richTextHasContent(page?.content) },
    ],
  }
}

export const pagesSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'pages',
  label: 'Pages',
  description: 'All required core and subtle-system pages are published and localized.',
  tutorialLink: 'https://example.com/tutorials/pages',
  checks: {
    exists: {
      label: 'Exists',
      description: 'The referenced document exists and is not in the trash.',
    },
    published: {
      label: 'Published',
      description: 'The document is published for this locale.',
    },
    'content-localized': {
      label: 'Content translated',
      description: "The document's content field is non-empty for this locale.",
    },
  },
  prepare: async ({ payload, locale, req }) => {
    const [appConfig, { docs: nodes }] = await Promise.all([
      getWmAppConfig(payload, locale, 0, req),
      payload.find({
        collection: 'subtle-system-nodes',
        locale,
        limit: 0,
        pagination: false,
        depth: 0,
        select: { slug: true, page: true },
        req: isolatedReq(req),
      }),
    ])

    const coreSlots: PageSlot[] = APP_PAGE_FIELDS.map((field) => ({
      id: refId(appConfig[field.name]),
      label: field.label ?? toWords(field.name),
    }))
    const nodeSlots: PageSlot[] = nodes.map((n) => ({
      id: refId(n.page),
      label: `Node ${n.slug}`,
    }))

    const allIds = Array.from(
      new Set(
        [...coreSlots, ...nodeSlots]
          .map((slot) => slot.id)
          .filter((id): id is number | string => id !== null),
      ),
    )

    const [pages, titles] = await Promise.all([
      allIds.length === 0
        ? Promise.resolve([])
        : payload
            .find({
              collection: 'pages',
              where: { id: { in: allIds } },
              locale,
              // `_status` is per-locale (#718) and `content` is localized, so
              // the fallback would report a page published and translated for
              // a locale nobody has touched.
              fallbackLocale: false,
              limit: 0,
              pagination: false,
              depth: 0,
              req: isolatedReq(req),
            })
            .then((r) => r.docs),
      readFallbackTitles(payload, 'pages', { locale, req, ids: allIds }),
    ])
    const pagesById = new Map<number | string, Record<string, unknown>>(
      pages.map((p) => [p.id, { ...p, title: titles.get(p.id) } as Record<string, unknown>]),
    )

    const coreDocs = coreSlots.map((slot) => reportForSlot(pagesById, slot))
    const nodeDocs = nodeSlots.map((slot) => reportForSlot(pagesById, slot))

    return { coreDocs, nodeDocs }
  },
  groups: [
    {
      key: 'core-pages',
      label: 'Core app pages',
      description: 'Every app-required page is published with localized content.',
      type: 'documents',
      evaluate: async ({ coreDocs }) => coreDocs,
    },
    {
      key: 'subtle-system-pages',
      label: 'Subtle system pages',
      description: 'All twelve subtle-system-node pages are published with localized content.',
      type: 'documents',
      evaluate: async ({ nodeDocs }) => nodeDocs,
    },
  ],
}
