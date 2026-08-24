import type { Endpoint } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { ROUTING_MODES } from '@/lib/clients/canonical'
import {
  EMBED_MODES,
  MAX_MOUNT_KEY_LENGTH,
  mergeEmbedReport,
  parseMountKey,
} from '@/lib/clients/embedMetadata'
import { parseBody, requireActiveClient } from '@/lib/endpoints'
import type { Client } from '@/payload-types'
import {
  assertClientOriginAllowed,
  getPgPool,
  isHostAllowed,
  parseAllowedDomains,
  quotedDbSchema,
} from '@/plugins/usage'

/**
 * Merge one mount into `embed_metadata` as a single atomic statement.
 *
 * **Not `payload.update`.** The usage plugin increments `usage_daily_requests` on this very row, on
 * its own connection, for this very request — while `payload.update` would hold the row inside the
 * request's transaction. The two block on each other and the request never returns; both sides were
 * observed waiting on `Lock: transactionid` in `pg_stat_activity`. A single autocommit statement has
 * no transaction to overlap with.
 *
 * `||` also merges server-side, which closes the read-modify-write window: two mounts of one site
 * reporting at the same instant both land instead of one overwriting the other.
 *
 * Same trade-off the usage counters already accept — this writes the published `clients` row and
 * not `_clients_v`, and skips the column's JSON Schema validator. Safe because the entry is built
 * here from a Zod-validated body; no caller-supplied shape reaches the column.
 */
const embedMergeSql = (quotedSchema: string) => `
  UPDATE ${quotedSchema}.clients
  SET embed_metadata = COALESCE(embed_metadata, '{}'::jsonb) || $1::jsonb
  WHERE id = $2
`


/** Response body of a successful `POST /api/clients/report`. */
export interface ClientEmbedReportResponse {
  ok: true
  /** Distinct mounts stored for this service after the merge. */
  mounts: number
  /** `false` when the report repeated a recent, identical observation. */
  updated: boolean
}

const bodySchema = z.object({
  /**
   * The page the embed is mounted on, as two fields.
   *
   * Separate rather than one URL because that is what the shipped widget sends
   * (sydevs/SahajAtlasWeb#159) — and because the split is what lets the path be
   * checked on its own. The widget strips the host page's query string and
   * fragment before sending; `parseMountKey` re-checks rather than trusting it.
   */
  origin: z.string().max(MAX_MOUNT_KEY_LENGTH),
  pathname: z.string().max(MAX_MOUNT_KEY_LENGTH),
  mode: z.enum(EMBED_MODES),
  topLevel: z.boolean(),
  urlWritable: z.boolean(),
  paramPersisted: z.boolean(),
  routing: z.enum(ROUTING_MODES),
})

/** Human-readable refusal per {@link parseMountKey} rejection reason. */
const MOUNT_KEY_MESSAGES = {
  invalid_url: '`origin` + `pathname` must form an absolute URL.',
  unsupported_scheme: '`origin` must be http or https.',
  query_or_fragment:
    '`pathname` must carry no query string or fragment, apart from a WordPress `?p=<digits>` permalink.',
  credentials: '`origin` must not carry credentials.',
  too_long: 'The reported mount is too long.',
} as const

/**
 * POST /api/clients/report
 *
 * The write path for `embedMetadata` (#633): the widget reports what it
 * observed about the page it is installed on, keyed by origin + pathname, and
 * the record accumulates one entry per mount.
 *
 * **Canonical viability is automatic; canonical *identity* is not.** A human
 * designates which discovered mount is canonical (`canonical.*` on the client);
 * these reports only decide whether that mount currently qualifies, in both
 * directions. That is what stops a canonical flip-flopping between two embeds
 * on one site, and it bounds the tampering surface — a forged report can only
 * assert viability for a mount someone already chose.
 *
 * Two origin checks, both needed:
 *
 * - **The request's** `Origin`/`Referer` must be in `allowedDomains`. `clients`
 *   is excluded from the usage plugin (`usagePlugin.ts`), so *no*
 *   `beforeOperation` hook fires on this route — the assertion is called by hand,
 *   the way the root `contactAdmin` endpoint does it.
 * - **The reported mount's host** must be in `allowedDomains` too. A client can
 *   only ever describe pages on domains it owns, whether or not a browser sent
 *   an `Origin` header.
 *
 * Rate limiting is Cloudflare's at the edge (500/min per client+IP), as for
 * every other client route — this app's `rateLimitHook` is a no-op on Railway.
 * On top of that the handler is free when there is nothing new to say: the
 * widget only POSTs on a *change*, so a repeat of a recent identical
 * observation is answered `updated: false` without a read or a write, and the
 * per-client mount cap bounds what a forger can accumulate.
 */
export const clientEmbedReport: Endpoint = {
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

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response
    const { origin, pathname, ...observation } = parsed.data

    const mount = parseMountKey(`${origin}${pathname}`)
    if (!mount.ok) {
      return Response.json(
        { errors: [{ message: MOUNT_KEY_MESSAGES[mount.reason], code: mount.reason }] },
        { status: 400 },
      )
    }

    // `req.user` is the full client doc — the API-key strategy loads it, which
    // is why origin enforcement reads `allowedDomains` off it too. Reading
    // `embedMetadata` from there keeps the no-op path free of any query.
    const client = req.user as Client
    const patterns = parseAllowedDomains(client.allowedDomains)
    if (patterns.length > 0 && !isHostAllowed(mount.host, patterns)) {
      req.payload.logger.warn({
        msg: 'clientEmbedReport: reported mount host is not in allowedDomains',
        clientId: client.id,
        host: mount.host,
      })
      return Response.json(
        { errors: [{ message: 'This URL is not on a domain allowed for this API client.' }] },
        { status: 403 },
      )
    }

    const { metadata, changed, evicted } = mergeEmbedReport({
      stored: client.embedMetadata,
      key: mount.key,
      observation,
      at: new Date().toISOString(),
    })

    if (changed) {
      if (evicted.length > 0) {
        req.payload.logger.warn({
          msg: 'clientEmbedReport: mount cap reached, evicted least-recently-seen mounts',
          clientId: client.id,
          evicted: evicted.length,
        })
      }
      const pool = getPgPool(req)
      if (!pool) {
        req.payload.logger.error({
          msg: 'clientEmbedReport: Postgres pool unavailable; report dropped',
          clientId: client.id,
        })
        return Response.json(
          { errors: [{ message: 'Could not record this report.' }] },
          { status: 500 },
        )
      }

      // Only the merged record goes over the wire; eviction is already applied
      // to it, so this is a whole-column write only when a mount was evicted.
      await pool.query(embedMergeSql(quotedDbSchema(req)), [
        JSON.stringify(metadata),
        client.id,
      ])
    }

    const body: ClientEmbedReportResponse = {
      ok: true,
      mounts: Object.keys(metadata).length,
      updated: changed,
    }
    return Response.json(body)
  },
}
