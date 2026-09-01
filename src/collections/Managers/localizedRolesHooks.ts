/**
 * Keep the per-locale role record on the three auth RESPONSES
 *
 * Fixing `req.user` alone is not enough, and the reason is client-side.
 * `AuthProvider` seeds its user from the RSC prop, then `fetchFullUser()` fires
 * on mount and overwrites it with `/api/managers/me`, and the refresh timer
 * overwrites it again later. `me`, `refresh-token` and `login` each re-read the
 * document themselves — passing `req`, so they resolve at `req.locale`, a single
 * locale — so without these hooks the admin shows the right projects on first
 * paint and then flips back to "No Projects Available" a moment later (#665).
 *
 * `afterMe` / `afterRefresh` / `afterLogin` are the correct hooks rather than
 * `me` / `refresh`: the latter short-circuit before token handling.
 */

import type { CollectionConfig, PayloadRequest } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { hydrateLocalizedRoles } from '@/plugins/access/localizedRoles'

type AuthUserShape = { collection?: string; id?: number | string; roles?: unknown }

/**
 * Replace `roles` on an auth-response user with the per-locale record.
 *
 * Never throws: an auth response that 500s locks the manager out of the admin
 * entirely, which is far worse than the flat roles it would be correcting. A
 * failure leaves the response as Payload built it and is logged.
 *
 * ⚠ **`localeIsolatedReq(req)`, not `req` and not nothing.** All three of these
 * hooks run inside an open transaction — `login.js` opens at :190 and commits at
 * :321, with `afterLogin` at :263 — so the read has to JOIN that transaction
 * rather than take a second pool connection, or a busy lane can hold two
 * connections per login and stop making progress. Passing the caller's own `req`
 * would join it but also repoint their `locale` to `'all'` for the rest of the
 * operation (#609). The copy shares `transactionID` by reference and owns its
 * `locale`, which is exactly the pair of properties needed here.
 */
async function withLocalizedRoles<T extends AuthUserShape>(
  user: null | T | undefined,
  req: PayloadRequest,
): Promise<null | T | undefined> {
  if (!user?.id) return user

  try {
    const roles = await hydrateLocalizedRoles(req.payload, user.id, localeIsolatedReq(req))
    return { ...user, roles }
  } catch (err) {
    req.payload.logger.error(
      { err, managerId: user.id },
      '[managers] could not resolve localized roles for an auth response',
    )
    return user
  }
}

/**
 * `/api/managers/me` — the one the admin client calls on mount, and therefore the
 * one that decides what the dashboard settles on.
 */
export const afterMeLocalizedRoles: NonNullable<
  NonNullable<CollectionConfig['hooks']>['afterMe']
>[number] = async ({ req, response }) => {
  const result = response as { user?: AuthUserShape | null } | null
  if (!result?.user) return response

  return { ...result, user: await withLocalizedRoles(result.user, req) }
}

/**
 * `/api/managers/refresh-token` — fires on the refresh timer, so a manager who
 * left a tab open would otherwise revert to the flat shape mid-session.
 */
export const afterRefreshLocalizedRoles: NonNullable<
  NonNullable<CollectionConfig['hooks']>['afterRefresh']
>[number] = async ({ req, ...rest }) => {
  const result = rest as unknown as { user?: AuthUserShape | null }
  if (!result?.user) return undefined

  return { ...result, user: await withLocalizedRoles(result.user, req) }
}

/**
 * The login response — the very first user the admin holds.
 *
 * ⚠ `afterLogin` runs BEFORE the field-level `afterRead` pass in `login.js`, which
 * resolves localized fields at the request locale. Setting the record here and
 * letting that pass run afterwards risks it being flattened straight back, so the
 * `/me` call on mount is what this ultimately relies on. Kept because it costs one
 * read and removes a frame of wrong state; the integration test asserts `/me`,
 * which is the load-bearing one.
 */
export const afterLoginLocalizedRoles: NonNullable<
  NonNullable<CollectionConfig['hooks']>['afterLogin']
>[number] = async ({ req, user }) => {
  return await withLocalizedRoles(user as AuthUserShape, req)
}
