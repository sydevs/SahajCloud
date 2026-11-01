import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

// Deep import, not the `@/plugins/usage` barrel: that one re-exports the pg-pool
// seam, and this module sits in a barrel of its own (`src/AGENTS.md`).
import { assertClientOriginAllowed } from '@/plugins/usage/hooks'

import { errorResponse } from './errorResponse'
import { requireActiveClient } from './requireActiveClient'

/**
 * The published-client gate and the origin check, as one short-circuit.
 *
 * ```typescript
 * const denied = requireClientAccess(req)
 * if (denied) return denied
 * ```
 *
 * ⚠ **A root endpoint runs no collection `beforeOperation` hook**, so the
 * origin check the usage plugin would have applied has to be called by hand —
 * and it throws rather than returning, which is the half every handler was
 * re-mapping to a response itself. Five did, identically, before this existed.
 * `docs/rules/endpoints.md` prescribes this helper rather than the two calls.
 *
 * ⚠ **`countClientRead` is deliberately not here.** The third half of the same
 * compensation, but its position is load-bearing: every one of these handlers
 * counts *after* parsing its query, so an unreadable parameter costs no quota
 * unit. Folding it in would move the count to the gate and start charging for a
 * 400.
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
