import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

// Deep import, not the `@/plugins/usage` barrel, which pulls more than this.
// ⚠ It does not make the edge server-free: `hooks.ts` reaches `pg`, so
// `@/lib/endpoints` is a barrel browser code may not import (#633) —
// `tests/unit/client-bundle-safety.spec.ts` holds that.
import { assertClientOriginAllowed } from '@/plugins/usage/hooks'

import { errorResponse } from './errorResponse'
import { requireActiveClient } from './requireActiveClient'

/**
 * The active-client gate and the origin check, as one short-circuit.
 *
 * ⚠ **A root endpoint runs no collection `beforeOperation` hook**, so the
 * origin check the usage plugin would have applied has to be called by hand,
 * and it throws rather than returning (`docs/rules/endpoints.md`).
 *
 * ⚠ **`countClientRead` is deliberately not here.** Every handler counts
 * *after* parsing its query, so an unreadable parameter costs no quota unit;
 * folded in, a 400 would be charged.
 */
export function requireClientAccess(req: PayloadRequest): Response | null {
  const denied = requireActiveClient(req)
  if (denied) return denied

  try {
    assertClientOriginAllowed(req)
  } catch (error) {
    if (error instanceof APIError) return errorResponse(error.message, error.status)
    throw error
  }

  return null
}
