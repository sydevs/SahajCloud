import type { Endpoint } from 'payload'

import { requireActiveManager } from '@/lib/endpoints'

import { buildImportTemplate, IMPORT_TEMPLATE_FILENAME } from '../csv/template'

/**
 * GET /api/event-imports/template
 *
 * The blank CSV a volunteer fills in, generated from `IMPORT_COLUMNS` on every
 * request so a renamed column cannot serve a template the parser refuses.
 *
 * ⚠ **Served as an endpoint rather than a committed file in `public/`.** The
 * generation is the point: a static copy is a second spelling of the column
 * spec, and the one it drifts from is the parser's.
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard serves published API
 * `clients`; this is the download beside the Import tab's upload control, and it
 * is gated for the same reason the tab is — the help text names the contact
 * columns we publish as-is, which is guidance for a manager and not a public
 * document. `managers` sits in no project and publishes no paths, so this is
 * absent from the OpenAPI client spec for the same reason `setProject` is.
 */
export const eventImportTemplate: Endpoint = {
  path: '/template',
  method: 'get',
  handler: (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    return new Response(buildImportTemplate(), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${IMPORT_TEMPLATE_FILENAME}"`,
        // The template is generated, so a cached copy is a stale column spec.
        'Cache-Control': 'no-store',
      },
    })
  },
}
