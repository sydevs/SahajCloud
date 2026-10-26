import type { InitPageResult, SanitizedConfig } from 'payload'

import { redirect } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'

/** Only what the guard reads, so a spec passes a literal rather than casting an `InitPageResult`. */
export type AdminAccessContext = Pick<InitPageResult, 'permissions'> & {
  req: {
    pathname: string
    payload: {
      config: {
        admin: { routes: Pick<SanitizedConfig['admin']['routes'], 'login' | 'unauthorized'> }
        routes: { admin: string }
      }
    }
    searchParams: URLSearchParams
    user: object | null
  }
}

/**
 * Refuse a path-bearing custom admin view to anyone `canAccessAdmin` denies.
 * `Root` does not: it skips its own redirect for any view declaring a `path`
 * (`isCustomAdminView`, @payloadcms/next 3.90.2). `docs/rules/admin-ui.md`
 * carries the rest, and `sanitized-config-rules.spec.ts` fails on a view that
 * skips this (#1030).
 *
 * `handleAuthRedirect` is in none of that package's export subpaths, so this
 * rebuilds its target: the unauthorized view for a signed-in user, the login
 * view otherwise, carrying the refused route — its own query included, less an
 * inbound `redirect` — so the visitor lands back where they were refused.
 */
export function requireAdminAccess({ permissions, req }: AdminAccessContext): void {
  if (permissions.canAccessAdmin) return

  const {
    admin: {
      routes: { login: loginRoute, unauthorized: unauthorizedRoute },
    },
    routes: { admin: adminRoute },
  } = req.payload.config

  const query = new URLSearchParams(req.searchParams)
  query.delete('redirect')
  const refused = query.size > 0 ? `${req.pathname}?${query}` : req.pathname

  const target = formatAdminURL({
    adminRoute,
    path: req.user ? unauthorizedRoute : loginRoute,
  })

  redirect(`${target}?redirect=${encodeURIComponent(refused)}`)
}
