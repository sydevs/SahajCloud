import type { Endpoint } from 'payload'

import { APIError } from 'payload'

import { parseBody, requireActiveClient } from '@/lib/endpoints'
import type { Client } from '@/payload-types'
import {
  assertClientOriginAllowed,
  isHostAllowed,
  normalizeHost,
  parseAllowedDomains,
} from '@/plugins/usage'

import { embedReportSchema, mergeEmbedReport, mountKey } from '../embedMetadata'

/** `POST /api/clients/report` success body. */
interface EmbedReportResponse {
  ok: true
  /** The `origin + pathname` key this report was filed under. */
  mount: string
  /** False when the report matched what was already stored and no write was made. */
  stored: boolean
}

/**
 * POST /api/clients/report
 *
 * The write path for `embedMetadata` — the widget reports what it observed about
 * the page it is mounted on, and the client's record accumulates one entry per
 * `origin + pathname` (#633).
 *
 * Gated three ways, because this is a write reachable from any page carrying a
 * published key:
 *
 * 1. **`requireActiveClient`** — a published `clients` key, as everywhere else.
 * 2. **`assertClientOriginAllowed`** — the browser-asserted `Origin`/`Referer`
 *    header against `allowedDomains`. Called by hand: `clients` is excluded from
 *    the usage plugin, so the `beforeOperation` hook that covers every other
 *    collection never runs here (`.claude/rules/endpoints.md`).
 * 3. **The reported origin** against `allowedDomains` as well. The header is what
 *    the browser vouches for; the body is what gets *stored as the key*, and only
 *    the second one is self-reported. They are checked separately rather than
 *    required to match — a widget inside a cross-origin iframe legitimately
 *    reports a different origin than the frame the request appears to come from,
 *    which is the `topLevel: false` case this feature exists to detect.
 *
 * Unlike a read, an **empty `allowedDomains` refuses** rather than allowing all.
 * The plugin's allow-all default is there to keep existing read clients working;
 * this endpoint is new, so it has no such debt — and with no allowlist there is
 * nothing to attribute a reported mount to, which makes the record worthless
 * precisely when someone is about to trust it to pick a canonical URL.
 *
 * Rate story: request rate is Cloudflare's at the edge, as for every client
 * request. What this handler adds is the two bounds the edge can't express — a
 * cap on distinct mounts, and no write at all for an unchanged report seen within
 * the hour (see `../embedMetadata.ts`).
 */
export const reportEmbedMetadata: Endpoint = {
  path: '/report',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveClient(req)
    if (denied) return denied

    try {
      assertClientOriginAllowed(req)
    } catch (error) {
      if (error instanceof APIError) {
        return Response.json({ errors: [{ message: error.message }] }, { status: error.status })
      }
      throw error
    }

    const parsed = await parseBody(req, embedReportSchema)
    if (!parsed.ok) return parsed.response
    const { origin, pathname, ...observation } = parsed.data

    const client = req.user as Client
    const patterns = parseAllowedDomains(client.allowedDomains)
    if (patterns.length === 0 || !isHostAllowed(normalizeHost(origin), patterns)) {
      req.payload.logger.warn({
        msg: 'reportEmbedMetadata: reported origin is not in allowedDomains',
        clientId: client.id,
        origin,
        configured: patterns.length,
      })
      return Response.json(
        {
          errors: [
            {
              message: patterns.length
                ? 'This origin is not allowed for this API client.'
                : 'This API client has no allowed domains configured, so embed reports cannot be attributed.',
            },
          ],
        },
        { status: 403 },
      )
    }

    const key = mountKey(origin, pathname)
    // Merged from the authenticated snapshot rather than a fresh read — it is the
    // same request's own document. The read-modify-write window only loses data if
    // two mounts of one site report in the same instant; the widget reports on a
    // change, so that costs at most one mount a delayed refresh, not a wrong value.
    const merge = mergeEmbedReport({
      existing: client.embedMetadata,
      key,
      observation,
      now: new Date(),
    })

    if (merge.status === 'limit-exceeded') {
      req.payload.logger.warn({
        msg: 'reportEmbedMetadata: mount limit reached; new mount refused',
        clientId: client.id,
        mount: key,
        limit: merge.limit,
      })
      return Response.json(
        {
          errors: [
            {
              message: `This client already tracks ${merge.limit} embed mounts, the maximum. Stop reporting new pages.`,
            },
          ],
        },
        { status: 429 },
      )
    }

    if (merge.status === 'merged') {
      await req.payload.update({
        collection: 'clients',
        id: client.id,
        data: { embedMetadata: merge.metadata },
        overrideAccess: true,
        req,
      })
    }

    const body: EmbedReportResponse = { ok: true, mount: key, stored: merge.status === 'merged' }
    return Response.json(body)
  },
}
