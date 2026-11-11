import type { Endpoint } from 'payload'

import { z } from 'zod'

import { errorResponse, parseBody, readFailureResponse } from '@/lib/endpoints'
import type { MailingListConfig } from '@/lib/mailingList/types'
import { MAILING_LIST_PROVIDERS } from '@/lib/mailingList/types'

import { loadManagedClient } from './managedClient'

const bodySchema = z.object({
  apiKey: z.string().min(1),
  clientId: z.string().optional(),
  doiFlowId: z.string().optional(),
  doubleOptIn: z.boolean().optional(),
  listId: z.string().optional(),
  provider: z.enum(MAILING_LIST_PROVIDERS).optional(),
})

/**
 * POST /api/clients/:id/mailing-list-key
 *
 * Set a service's mailing-list provider secret. The key is `secretField`, so it
 * is in no form state and a form save carries none — this is the one way in.
 *
 * **Admin-panel only, so it skips the API-client guard**
 * (`docs/rules/endpoints.md`): no client key may reach a `clients` write, and
 * this is `loadManagedClient` — an active manager, then the row's own read
 * access — exactly as `verifyEmbed` next door.
 *
 * **The body is a patch, not a merge.** `payload.update` runs with the caller's
 * own `req`, so the Atlas-tab lock, the field locks, `validateMailingList` and
 * `secretField`'s encryption all run as they do for a form save, and the hook
 * is what merges the patch over the stored row and proves the result. A
 * provider refusal arrives as that hook's `APIError`, in the provider's own
 * words, with nothing written.
 *
 * ⚠ **The body carries the credentials the key will be used with**
 * (`CREDENTIAL_KEYS`), because a key proven against a different list proves
 * nothing. They are saved with it, so the next form save finds nothing changed
 * and skips the round trip.
 */
export const setMailingListKey: Endpoint = {
  path: '/:id/mailing-list-key',
  method: 'post',
  handler: async (req) => {
    const gate = await loadManagedClient(req)
    if (!gate.ok) return gate.response

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response

    const id = gate.client.id
    try {
      await req.payload.update({
        collection: 'clients',
        id,
        data: { mailingList: parsed.data },
        overrideAccess: false,
        req,
      })
    } catch (error) {
      return readFailureResponse(req, error, 'The key could not be saved.', {
        msg: 'setMailingListKey: the key could not be saved',
        clientId: id,
      })
    }

    // ⚠ **Payload strips a field its `update` refuses rather than erroring**
    // (`docs/rules/access.md`), so a caller the Atlas tab's own lock denies
    // would otherwise get a `200` having stored nothing. Reading the key back
    // judges the outcome, rather than re-deriving the lock that produced it.
    const stored = (await req.payload.findByID({
      collection: 'clients',
      id,
      depth: 0,
      overrideAccess: true,
      req,
      select: { mailingList: true },
    })) as { mailingList?: MailingListConfig }

    if (stored.mailingList?.apiKey !== parsed.data.apiKey) {
      return errorResponse('You are not allowed to set this service’s mailing-list key.', 403)
    }

    return Response.json({ ok: true })
  },
}
