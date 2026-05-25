import { labelOf, refId, type DocumentReport, type SectionSpec } from '@/lib/status'
import { richTextHasContent } from '@/lib/status/helpers'

import { APP_REQUIRED_PAGE_FIELDS } from '../config'
import { getWmAppConfig, type WeMeditateAppStatusConfig } from './shared'

interface Ctx {
  coreDocs: DocumentReport[]
  nodeDocs: DocumentReport[]
}

function reportForPage(
  pagesById: Map<number | string, Record<string, unknown>>,
  id: number | string | null,
): DocumentReport | null {
  if (id === null) return null
  const page = pagesById.get(id)
  if (!page) return null
  return {
    id: page.id as number | string,
    label: labelOf(page as { id: number | string; title?: unknown }),
    checks: [
      { key: 'published', passed: page._status === 'published' },
      { key: 'content-localized', passed: richTextHasContent(page.content) },
    ],
  }
}

export const pagesSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'pages',
  tutorialLink: null,
  checks: {
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
        req,
      }),
    ])

    const corePageIds = APP_REQUIRED_PAGE_FIELDS.map((fieldName) =>
      refId(appConfig[fieldName]),
    )
    const nodePageIds = nodes.map((n) =>
      refId((n as unknown as Record<string, unknown>).page),
    )

    const allIds = Array.from(
      new Set(
        [...corePageIds, ...nodePageIds].filter(
          (id): id is number | string => id !== null,
        ),
      ),
    )

    const pages =
      allIds.length === 0
        ? []
        : (
            await payload.find({
              collection: 'pages',
              where: { id: { in: allIds } },
              locale,
              limit: 0,
              pagination: false,
              depth: 0,
              req,
            })
          ).docs
    const pagesById = new Map<number | string, Record<string, unknown>>(
      pages.map((p) => [p.id, p as unknown as Record<string, unknown>]),
    )

    const coreDocs = corePageIds
      .map((id) => reportForPage(pagesById, id))
      .filter((r): r is DocumentReport => r !== null)
    const nodeDocs = nodePageIds
      .map((id) => reportForPage(pagesById, id))
      .filter((r): r is DocumentReport => r !== null)

    return { coreDocs, nodeDocs }
  },
  groups: [
    {
      key: 'core-pages',
      label: 'Core app pages',
      description: 'All ten required app pages are published with localized content.',
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
