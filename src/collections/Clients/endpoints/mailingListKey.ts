import type { Endpoint, FieldAccess, PayloadRequest } from 'payload'

import { z } from 'zod'

import {
  errorResponse,
  parseBody,
  readFailureResponse,
  requireActiveManager,
} from '@/lib/endpoints'
import { isMailingListConfigured } from '@/lib/mailingList/subscribe'
import type { MailingListConfig } from '@/lib/mailingList/types'
import type { Client } from '@/payload-types'

import { CREDENTIAL_KEYS } from '../hooks/validateMailingList'

const bodySchema = z.object({
  apiKey: z.string().min(1),
  clientId: z.string().optional(),
  doiFlowId: z.string().optional(),
  doubleOptIn: z.boolean().optional(),
  listId: z.string().optional(),
  provider: z.string().optional(),
})

/**
 * The composed `update` lock on `mailingList.apiKey`, read off the booted config
 * rather than restated here — `lockTabs` ANDs the Atlas tab's own rule onto the
 * field's own, and a copy of either here would be free to disagree with it.
 *
 * ⚠ **Payload strips a field its `update` refuses rather than erroring**
 * (`docs/rules/access.md`), so without this the endpoint would answer `200`
 * having stored nothing.
 */
async function mayWriteKey(req: PayloadRequest, doc: Client): Promise<boolean> {
  const group = req.payload.collections.clients.config.flattenedFields.find(
    (field) => 'name' in field && field.name === 'mailingList',
  )
  const field =
    group && 'flattenedFields' in group
      ? group.flattenedFields.find((inner) => 'name' in inner && inner.name === 'apiKey')
      : undefined
  const update =
    field && 'access' in field ? (field.access?.update as FieldAccess | undefined) : undefined
  if (!update) {
    throw new Error('Clients.mailingList.apiKey carries no update lock to evaluate.')
  }
  return Boolean(await update({ id: doc.id, data: {}, doc, req, siblingData: {} }))
}

/**
 * POST /api/clients/:id/mailing-list-key
 *
 * Set a service's mailing-list provider secret. The key is `secretField`, so it
 * is in no form state and a form save carries none — this is the one way in.
 *
 * **Admin-panel only, so it skips the API-client guard**
 * (`docs/rules/endpoints.md`): no client key may reach a `clients` write, and
 * this is `requireActiveManager` plus the row's own read access, exactly as
 * `verifyEmbed` next door.
 *
 * **It stores through `payload.update` with the caller's own `req`**, so the
 * Atlas-tab lock, the field locks, `validateMailingList`'s provider round trip
 * and `secretField`'s encryption all run as they do for a form save. A provider
 * refusal arrives as that hook's `APIError` and is passed back in the provider's
 * own words, with nothing written.
 *
 * ⚠ **The body carries the credentials the key will be used with**, because a
 * key proven against a different list proves nothing. They are merged over the
 * stored group and saved with it — so the next form save sends identical values
 * and skips the round trip.
 */
export const setMailingListKey: Endpoint = {
  path: '/:id/mailing-list-key',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const clientId = Number(req.routeParams?.id)
    if (!Number.isInteger(clientId)) return errorResponse('Invalid service id.', 400)

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response

    // ⚠ **`overrideAccess: false`, with the caller's own `req`**, as
    // `verifyEmbed` does: `requireActiveManager` admits any active manager, so
    // the row's own read access is what decides whether this manager may touch
    // this service. An unlisted manager gets the 404.
    let client: Client
    try {
      client = await req.payload.findByID({
        collection: 'clients',
        id: clientId,
        depth: 0,
        overrideAccess: false,
        req,
      })
    } catch {
      return errorResponse('Service not found.', 404)
    }

    if (!(await mayWriteKey(req, client))) {
      return errorResponse('You are not allowed to set this service’s mailing-list key.', 403)
    }

    const posted = Object.fromEntries(
      CREDENTIAL_KEYS.filter((key) => parsed.data[key] !== undefined).map((key) => [
        key,
        parsed.data[key],
      ]),
    )
    const mailingList = {
      ...((client.mailingList ?? {}) as MailingListConfig),
      ...posted,
    } as MailingListConfig

    // A key cannot be proven without a provider and a list to prove it against,
    // and an unprovable key is what this endpoint exists to refuse.
    if (!isMailingListConfigured(mailingList)) {
      return errorResponse(
        'Switch the mailing list on and choose a provider and list before adding a key.',
        400,
      )
    }

    try {
      await req.payload.update({
        collection: 'clients',
        id: clientId,
        data: { mailingList },
        overrideAccess: false,
        req,
      })
    } catch (error) {
      return readFailureResponse(req, error, 'The key could not be saved.', {
        msg: 'setMailingListKey: the key could not be saved',
        clientId,
      })
    }

    return Response.json({ ok: true })
  },
}
