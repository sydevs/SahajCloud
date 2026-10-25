import { redirect } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'

/**
 * What the guard reads out of a view's `initPageResult`, which satisfies it.
 * Spelling only these four reads is what lets a spec call the guard with a
 * literal instead of casting a whole `InitPageResult`.
 */
export type AdminAccessContext = {
  permissions: { canAccessAdmin?: boolean }
  req: {
    pathname: string
    payload: {
      config: {
        admin: { routes: { login: `/${string}`; unauthorized: `/${string}` } }
        routes: { admin: string }
      }
    }
    user: object | null
  }
}

/**
 * Refuse a path-bearing custom admin view to anyone `canAccessAdmin` denies.
 *
 * Payload's `Root` view skips its own auth redirect for every
 * `admin.components.views` entry declaring a `path` other than `'/'`:
 * `isCustomAdminView` matches on that path alone and reads no `public` flag,
 * whatever its docstring claims (@payloadcms/next 3.90.2). So each such view
 * owes its own gate, and one that forgets it is unauthenticated with nothing to
 * notice — `sanitized-config-rules.spec.ts` fails on a view that skips this
 * (#1030).
 *
 * `handleAuthRedirect` is not exported, so this reproduces its target: the
 * unauthorized view for a signed-in user, the login view otherwise, each
 * carrying the refused route as `redirect` so the visitor lands back here.
 */
export function requireAdminAccess({ permissions, req }: AdminAccessContext): void {
  if (permissions.canAccessAdmin) return

  const {
    admin: {
      routes: { login: loginRoute, unauthorized: unauthorizedRoute },
    },
    routes: { admin: adminRoute },
  } = req.payload.config

  const target = formatAdminURL({
    adminRoute,
    path: req.user ? unauthorizedRoute : loginRoute,
  })

  redirect(`${target}?${new URLSearchParams({ redirect: req.pathname })}`)
}
