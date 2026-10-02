import type { DocumentViewServerProps } from 'payload'
import type { ReactNode } from 'react'

import { Banner, Gutter } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'

import type { Region } from '@/payload-types'

import { importGate } from './importGate'

/**
 * `/admin/collections/regions/<id>/import` — the bulk class importer.
 *
 * ⚠ **This view, not the tab, is the gate.** The route answers a typed URL with
 * no tab involved, and `ImportTabLink` can only see what the browser already
 * holds. So every refusal `POST /api/event-imports/upload` makes is made here
 * too, against the database, before anything is offered — in the endpoint's own
 * order, so a reader comparing the two reads one sequence.
 */
export default async function ImportView({ doc, initPageResult }: DocumentViewServerProps) {
  const { req } = initPageResult

  const gate = await importGate({ region: doc as Region | null, req })
  if (!gate.ok) return <Refusal>{gate.refusal}</Refusal>
  const { region } = gate

  // Built from the configured API route rather than typed, because `routes.api`
  // is configurable and a dead download link would look like a server fault.
  const templateUrl = formatAdminURL({
    apiRoute: req.payload.config.routes.api,
    path: '/event-imports/template',
  })

  return (
    <Gutter>
      <p>
        Import classes into <strong>{region.name?.trim() || region.slug}</strong> from a CSV.
      </p>
      {/* A plain link, because the endpoint answers `no-store`: the file is
          generated per request from the column spec, so a cached copy is a stale
          set of headings. */}
      <p>
        <a download href={templateUrl}>
          Download the CSV template
        </a>
      </p>
    </Gutter>
  )
}

const Refusal = ({ children }: { children: ReactNode }) => (
  <Gutter>
    <Banner type="error">{children}</Banner>
  </Gutter>
)
