import type { PayloadRequest } from 'payload'

import { requireActiveManager } from '@/lib/endpoints'
import { bypassPermissions, hasPermission, roleScopeFromLocale } from '@/plugins/access'

/**
 * The meditation id both transcript endpoints operate on, or the response that
 * refuses the caller.
 *
 * Shared because the two differ only in the operation they require and the
 * wording of the refusal — leaving the permission shape, the locale scope and
 * the id validation stated once each. The locale matters: a manager's roles are
 * per-locale, so the scope comes from `req.locale` (#701).
 *
 * Both endpoints are manager-only, so neither calls `requireActiveClient`: an
 * API client has no business reading an editor's working data, and neither
 * endpoint is published in the OpenAPI spec.
 */
export function requireTranscriptAccess(
  req: PayloadRequest,
  operation: 'read' | 'update',
  forbidden: string,
): Response | number {
  const denied = requireActiveManager(req)
  if (denied) return denied

  if (
    !hasPermission(
      {
        user: req.user,
        collection: 'meditations',
        operation,
        locale: roleScopeFromLocale(req.locale),
      },
      bypassPermissions,
    )
  ) {
    return Response.json({ errors: [{ message: forbidden }] }, { status: 403 })
  }

  const id = Number(req.routeParams?.id)
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ errors: [{ message: 'Invalid meditation id.' }] }, { status: 400 })
  }
  return id
}
