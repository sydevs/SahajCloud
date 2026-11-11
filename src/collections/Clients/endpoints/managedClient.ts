import type { PayloadRequest } from 'payload'

import { errorResponse, requireActiveManager } from '@/lib/endpoints'
import type { Client } from '@/payload-types'

/**
 * The service a manager-authenticated endpoint was asked about, or the refusal
 * to answer with.
 *
 * ⚠ **`overrideAccess: false`, with the caller's own `req`.**
 * `requireActiveManager` admits any active manager with no document check, so
 * the row's own read access — the document-manager path
 * (`docs/rules/access.md`) — is what decides whether this manager may touch
 * this service. An unlisted manager gets the 404.
 *
 * Both of this collection's manager endpoints open this way, and the rule that
 * decides which manager reaches which service is one rule: spelled twice, a
 * change to the refusal or to the read lands in one of them.
 */
export async function loadManagedClient(
  req: PayloadRequest,
): Promise<{ client: Client; ok: true } | { ok: false; response: Response }> {
  const denied = requireActiveManager(req)
  if (denied) return { ok: false, response: denied }

  const id = Number(req.routeParams?.id)
  if (!Number.isInteger(id)) {
    return { ok: false, response: errorResponse('Invalid service id.', 400) }
  }

  try {
    const client = await req.payload.findByID({
      collection: 'clients',
      id,
      depth: 0,
      overrideAccess: false,
      req,
    })
    return { client, ok: true }
  } catch {
    return { ok: false, response: errorResponse('Service not found.', 404) }
  }
}
