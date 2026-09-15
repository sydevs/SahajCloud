import type { CollectionBeforeValidateHook } from 'payload'

import { APIError } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

/**
 * The roles that may name **any** client's subscribe form.
 *
 * The We Meditate surfaces render forms for the whole platform, so a row of
 * theirs legitimately targets a list they do not own. Every other client may
 * only reach its own.
 */
const UNRESTRICTED_ROLES = ['wemeditate-web-client', 'wemeditate-app-client']

/**
 * beforeValidate (create): a client may not subscribe an address to **another
 * client's** mailing list.
 *
 * The target list is resolved at delivery time from the form's `client`, so
 * without this check a create-only key could post a subscribe row naming any
 * other service's form and have the queue push addresses onto a list it has no
 * relationship with — spending somebody else's quota and sender reputation, and
 * putting a stranger's address on their list. The row's own `client` column is
 * stamped from the key and cannot be forged, but it is not what delivery reads
 * when a form is named.
 *
 * ⚠ **The check has to live at create**, not at delivery. By delivery the
 * sender has already been upserted into `users` and the row is on file, and a
 * job refusing it leaves a stored request nobody asked for. Refusing the write
 * is what keeps the forbidden target from existing at all — which is why this
 * hook is registered **before** `prepareUserSubmission`.
 *
 * A row with no form is out of scope: it inherits the provenance client (a
 * registration opt-in spawns exactly that shape), so it can only ever reach the
 * caller's own list.
 */
export const enforceSubscribeReach: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (!data || operation !== 'create') return data
  if (data.type !== 'subscribe') return data
  if (req.user?.collection !== 'clients') return data

  const formId = relationId(data.form)
  if (formId == null) return data

  const roles = Array.isArray(req.user.roles) ? (req.user.roles as string[]) : []
  if (roles.some((role) => UNRESTRICTED_ROLES.includes(role))) return data

  // Read without forwarding `req`: a form is committed state, and a nested read
  // that joins the caller's transaction takes the whole create down with it
  // when it goes wrong (`src/collections/AGENTS.md`).
  const form = await req.payload.findByID({
    collection: 'forms',
    id: formId,
    depth: 0,
    select: { client: true },
    overrideAccess: true,
    disableErrors: true,
  })

  const targetClientId = relationId((form as { client?: unknown } | null)?.client)
  // A form naming no client cannot be a subscribe form — `validateFormAction`
  // refuses that at save time — so this is a form of another action type, and
  // the type/actionType check in `prepareUserSubmission` is what answers it.
  if (targetClientId == null || targetClientId === req.user.id) return data

  throw new APIError(
    'This service may only subscribe addresses to its own mailing list.',
    403,
    { code: 'subscribe_reach_denied' },
    true,
  )
}
