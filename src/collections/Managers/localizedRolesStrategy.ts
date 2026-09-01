/**
 * Auth strategy that gives an authenticated manager roles for EVERY locale
 *
 * Payload's own `local-jwt` strategy loads the user with
 * `payload.findByID({ id, collection, depth })` — no `locale`, no `req` — so
 * `createLocalReq` resolves localized fields at the default locale. A manager's
 * `roles` therefore arrives as a flat English array on every request, whatever
 * the request's own locale, and the per-locale model the access plugin is built
 * on never materialises (#665).
 *
 * This wraps that strategy rather than reimplementing it. `Managers` inherits
 * `useSessions: true`, so a hand-rolled copy would have to reproduce the session
 * check, the `_verified` gate and the autoLogin fallbacks — three things that
 * fail closed in ways nobody would notice until someone could not log in.
 *
 * Registration order makes this safe: custom strategies are collected from the
 * collections first and `local-jwt` is appended LAST, and `executeAuthStrategies`
 * returns on the first strategy that yields a user. Adding this one does not
 * disable the default; it runs in front of it.
 */

import type { AuthStrategyFunctionArgs, AuthStrategyResult } from 'payload'

import { JWTAuthentication } from 'payload'

import type { LocalizedRoles } from '@/plugins/access/localizedRoles'
import { hydrateLocalizedRoles } from '@/plugins/access/localizedRoles'

type AuthUser = NonNullable<AuthStrategyResult['user']>

export const LOCALIZED_ROLES_STRATEGY = 'managers-localized-roles'

/**
 * Attach the per-locale record to an authenticated user.
 *
 * The cast is unavoidable and is the same one `tests/utils/testData.ts` documents:
 * Payload generates `Manager['roles']` as a flat array because that is what a
 * single-locale read returns, and the generated types cannot express the
 * per-locale record a `locale: 'all'` read produces. Every consumer inside
 * `src/plugins/access` already accepts both shapes (`TypedAuthUser.roles`).
 */
function withRoles<T extends AuthUser>(user: T, roles: LocalizedRoles): T {
  return { ...user, roles } as unknown as T
}

/**
 * Authenticate a manager JWT and replace `roles` with the per-locale record.
 *
 * Two failure modes are handled explicitly, because both would restore the bug
 * silently:
 *
 * 1. **Not a manager.** `authStrategies` is one flat global array shared with
 *    `Clients`, so this strategy sees client JWTs too. It returns `{ user: null }`
 *    for them, which lets the loop fall through to `local-jwt` — the right answer,
 *    since `Clients.roles` is not localized and needs no hydration.
 *
 * 2. **Hydration failed.** `executeAuthStrategies` SWALLOWS a thrown error and
 *    continues to the next strategy, so throwing here would hand the request to
 *    `local-jwt` and quietly reinstate the flat, over-granting shape. Instead the
 *    manager is returned with an empty role record: they see the "No Projects
 *    Available" banner, which is visible and recoverable, rather than silently
 *    receiving their English roles in all 19 locales.
 */
export const localizedRolesStrategy = {
  name: LOCALIZED_ROLES_STRATEGY,
  authenticate: async (args: AuthStrategyFunctionArgs): Promise<AuthStrategyResult> => {
    const result = await JWTAuthentication(args)
    const user = result.user

    // Not a manager (or not authenticated) — let `local-jwt` handle it.
    if (!user || user.collection !== 'managers') return { user: null }

    try {
      const roles = await hydrateLocalizedRoles(args.payload, user.id)
      return { ...result, user: withRoles(user, roles) }
    } catch (err) {
      args.payload.logger.error(
        { err, managerId: user.id },
        `[${LOCALIZED_ROLES_STRATEGY}] could not resolve localized roles; ` +
          'denying all role-based access for this request',
      )
      return { ...result, user: withRoles(user, {}) }
    }
  },
}
