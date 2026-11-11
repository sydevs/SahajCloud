import type { Endpoint, PayloadRequest } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { errorResponse, parseBody, requireActiveManager } from '@/lib/endpoints'
import { MAILING_LIST_PROVIDERS } from '@/lib/mailingList/types'
import type { Client } from '@/payload-types'
import { managersOnlyFieldAccess } from '@/plugins/access'

/** `GET /api/clients/:id/mailing-list-key` — whether a key is stored, and its tail. */
export interface MailingListKeyStatus {
  set: boolean
  /** The stored key's last four characters, or `null` when none is stored. */
  last4: string | null
}

const bodySchema = z.object({
  apiKey: z.string().min(1),
  clientId: z.string().optional(),
  doiFlowId: z.string().optional(),
  doubleOptIn: z.boolean().optional(),
  listId: z.string().min(1),
  provider: z.enum(MAILING_LIST_PROVIDERS),
})

/**
 * The row this manager may edit, or a `Response` refusing them.
 *
 * ⚠ **`overrideAccess: false`, with the caller's own `req`** — `requireActiveManager`
 * admits any active manager with no document check, so the row's own read access
 * is what decides. The `apiKey` field's write lock is then evaluated on top, so
 * this door is never wider than a form save of the same field.
 */
async function authorize(
  req: PayloadRequest,
): Promise<{ client: Client } | { response: Response }> {
  const denied = requireActiveManager(req)
  if (denied) return { response: denied }

  const id = Number(req.routeParams?.id)
  if (!Number.isInteger(id)) return { response: errorResponse('Invalid service id.', 400) }

  let client: Client
  try {
    client = await req.payload.findByID({
      collection: 'clients',
      depth: 0,
      id,
      overrideAccess: false,
      req,
    })
  } catch {
    return { response: errorResponse('Service not found.', 404) }
  }

  const mayWrite = await managersOnlyFieldAccess({ data: {}, doc: client, req, siblingData: {} })
  if (!mayWrite)
    return { response: errorResponse('You are not allowed to perform this action.', 403) }

  return { client }
}

/**
 * `GET /api/clients/:id/mailing-list-key`
 *
 * Whether a provider key is stored, and its last four characters — the whole of
 * what the admin control shows. The key itself is never readable.
 *
 * Admin-panel only, so it skips the API-client guard: no published key reaches a
 * `clients` row other than its own, and `managersOnlyFieldAccess` refuses one here.
 */
export const mailingListKeyStatus: Endpoint = {
  handler: async (req) => {
    const gate = await authorize(req)
    if ('response' in gate) return gate.response

    // The stored column is absent from `gate.client`: its own `read` lock closes
    // every read. `overrideAccess: true` runs the decrypting `afterRead` instead.
    const row = await req.payload.findByID({
      collection: 'clients',
      depth: 0,
      id: gate.client.id,
      overrideAccess: true,
      select: { mailingList: true },
    })
    const stored = row?.mailingList?.apiKey
    const body: MailingListKeyStatus =
      typeof stored === 'string' && stored !== ''
        ? { last4: stored.slice(-4), set: true }
        : { last4: null, set: false }
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
  },
  method: 'get',
  path: '/:id/mailing-list-key',
}

/**
 * `POST /api/clients/:id/mailing-list-key`
 *
 * Store a mailing-list provider key, after the provider has accepted it with the
 * credentials it will be used beside. The write goes through `payload.update`, so
 * the Atlas-tab lock, the field locks, `validateMailingList` and `secretField`'s
 * own encryption all run exactly as they do for a form save.
 *
 * Admin-panel only, so it skips the API-client guard: {@link authorize} admits
 * `managers` callers alone.
 */
export const mailingListKey: Endpoint = {
  handler: async (req) => {
    const gate = await authorize(req)
    if ('response' in gate) return gate.response

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response

    try {
      await req.payload.update({
        collection: 'clients',
        data: { mailingList: { ...parsed.data, enabled: true } },
        id: gate.client.id,
        overrideAccess: false,
        req,
      })
    } catch (error) {
      // `validateMailingList` refuses the save with the provider's own words.
      // Anything else is ours, and says nothing about the key.
      if (error instanceof APIError && error.status === 400) {
        return errorResponse(error.message, 400)
      }
      throw error
    }

    // Every credential except the key, so the next form save carries identical
    // values and `validateMailingList` skips the provider round trip. The key is
    // absent from form state by design, and a save without it keeps the stored one.
    const { apiKey: _apiKey, ...credentials } = parsed.data
    return Response.json(
      { credentials, last4: parsed.data.apiKey.slice(-4) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  },
  method: 'post',
  path: '/:id/mailing-list-key',
}
