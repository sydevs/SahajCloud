import { APP_REQUIRED_PAGE_FIELDS } from '@/globals/WeMeditateAppConfig/WeMeditateAppConfig'
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

/**
 * A slot whose page was trashed (or deleted, which empties the slot) after the
 * config was saved still gets a failing row: `required` is only checked on
 * save, and no client can read the page, so the app gets nothing (#1252).
 */
function reportForPage(
  pagesById: Map<number | string, Record<string, unknown>>,
  id: number | string | null,
  slotLabel: string,
): DocumentReport {
  const page = id === null ? undefined : pagesById.get(id)
  if (!page) {
    return {
      id: id ?? `unset:${slotLabel}`,
      label: id === null ? `${slotLabel} — not set` : `${slotLabel} — page ${id} not found`,
      checks: [
        { key: 'exists', passed: false },
        { key: 'published', passed: false },
        { key: 'content-localized', passed: false },
      ],
    }
  }
  return {
    id: page.id as number | string,
    label: labelOf(page as { id: number | string; title?: unknown }),
    checks: [
      { key: 'exists', passed: true },
      { key: 'published', passed: page._status === 'published' },
      { key: 'content-localized', passed: richTextHasContent(page.content) },
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
      description: 'The referenced page exists and is not in the trash.',
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
        depth: 1,
        select: { slug: true, page: true },
        req: isolatedReq(req),
      }),
    ])

    const corePageIds = APP_REQUIRED_PAGE_FIELDS.map((fieldName) => refId(appConfig[fieldName]))
    const nodePageIds = nodes.map((n) => refId((n as unknown as Record<string, unknown>).page))

    const allIds = Array.from(
      new Set([...corePageIds, ...nodePageIds].filter((id): id is number | string => id !== null)),
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

    const coreDocs = corePageIds.map((id, i) =>
      reportForPage(pagesById, id, APP_REQUIRED_PAGE_FIELDS[i]),
    )
    const nodeDocs = nodePageIds.map((id, i) =>
      reportForPage(pagesById, id, `Node ${nodes[i].slug ?? nodes[i].id}`),
    )

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
