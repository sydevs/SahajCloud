import type { DocumentViewServerProps } from 'payload'
import type { ReactNode } from 'react'

import { Banner, Gutter } from '@payloadcms/ui'

import { targetOwnership } from '@/collections/EventImports/batchRequest'
import { mayStageImport } from '@/collections/EventImports/capability'
import { isProposableTargetLevel } from '@/collections/EventImports/propose/tree'
import type { Region } from '@/payload-types'

/**
 * `/admin/collections/regions/<id>/import` — the bulk class importer.
 *
 * ⚠ **This view, not the tab, is the gate.** A tab is a convenience: the route
 * answers a typed URL with no tab involved, and `ImportTabLink` can only see
 * what the browser already holds. So every refusal the upload endpoint makes is
 * made here too, against the database, before anything is offered.
 *
 * The three questions are the endpoint's own, in its order: may this caller stage
 * an import at all, do they manage this region, and can this region hold the
 * sub-regions a batch proposes.
 */
export default async function ImportView({ doc, initPageResult }: DocumentViewServerProps) {
  const { req } = initPageResult
  const region = doc as Region

  const refusal = await refuse({ doc: region, req })
  if (refusal) {
    return (
      <Gutter>
        <Banner type="error">{refusal}</Banner>
      </Gutter>
    )
  }

  return (
    <Gutter>
      <p>
        Import classes into <strong>{region.name?.trim() || region.slug}</strong> from a CSV.
      </p>
      {/* `no-store` on the endpoint is why this is a plain link: the file is
          generated per request from the column spec, so a cached copy would be a
          stale set of headings. */}
      <p>
        <a download href="/api/event-imports/template">
          Download the CSV template
        </a>
      </p>
    </Gutter>
  )
}

async function refuse({
  doc,
  req,
}: {
  doc: Region
  req: DocumentViewServerProps['initPageResult']['req']
}): Promise<ReactNode | null> {
  if (!mayStageImport({ user: req.user, locale: req.locale })) {
    return 'You are not allowed to create classes in this language.'
  }

  const ownership = await targetOwnership(req, doc.id)
  if (ownership === 'no-regions') return 'You do not manage any region.'
  if (ownership === 'not-yours') return 'You do not manage that region.'

  if (!isProposableTargetLevel(doc.level)) {
    return `A ${doc.level} cannot hold imported classes' regions. Target a country, state or city.`
  }

  return null
}
