/**
 * Making the per-locale role record survive authentication.
 *
 * `hydrateLocalizedRoles` produces the record. This file is the four places
 * where that record must run again, so nothing later flattens it back. All
 * four live in the access plugin, not in `Managers`: the per-locale role
 * model belongs to the plugin. The collection only stores the field. A
 * collection that had to remember to wire this up could forget to.
 *
 * `withLocalizedRoleAuth` attaches all four. `accessPlugin` applies it to
 * every collection that qualifies. So there is exactly one wiring site for
 * the whole mechanism, and it is not in a collection file.
 *
 * ## Why four, and not one
 *
 * No single extension point covers all four moments. Payload re-reads the
 * manager at four different points:
 *
 * | Moment | What re-reads the manager | Without this fix |
 * | --- | --- | --- |
 * | Every authenticated request | `local-jwt`, at the default locale | `req.user.roles` is flat. Every server-side access check is wrong. |
 * | `POST /api/managers/login` | `login.js` | The first user the admin holds is flat. |
 * | `GET /api/managers/me` | `me.js`, at `req.locale` | `AuthProvider` calls this on mount and overwrites the strategy's work. Projects are right on first paint, then "No Projects Available". |
 * | `POST /api/managers/refresh-token` | `refresh.js`, at `req.locale` | A tab left open reverts mid-session. |
 *
 * The strategy fixes the first moment. The three `after*` hooks fix the
 * rest. Dropping any one of them leaves a reachable path where the bug is
 * still live. That is why this uses four fixes, not a judgment call about
 * which matter most — see #665.
 *
 * `afterMe`, `afterRefresh`, and `afterLogin` are the correct hooks to use,
 * not `me` or `refresh`. The latter two short-circuit before token handling.
 */

import type { LocalizedRoles } from './localizedRoles'
import type {
  AuthStrategyFunctionArgs,
  AuthStrategyResult,
  CollectionConfig,
  PayloadRequest,
} from 'payload'

import { flattenTopLevelFields, JWTAuthentication } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { hydrateLocalizedRoles } from './localizedRoles'


type AuthUser = NonNullable<AuthStrategyResult['user']>
type AuthUserShape = { collection?: string; id?: number | string; roles?: unknown }

export const LOCALIZED_ROLES_STRATEGY = 'localized-roles'

/**
 * Attach the per-locale record to an authenticated user.
 *
 * The cast here is unavoidable. `tests/utils/testData.ts` documents the same
 * one: Payload generates `Manager['roles']` as a flat array, because that is
 * what a single-locale read returns. The generated types cannot express the
 * per-locale record that a `locale: 'all'` read produces. Every consumer
 * inside this plugin already accepts both shapes (`TypedAuthUser.roles`).
 */
function withRoles<T extends AuthUser>(user: T, roles: LocalizedRoles): T {
  return { ...user, roles } as unknown as T
}

// ============================================================================
// 1. THE AUTH STRATEGY: fixes `req.user` on every authenticated request
// ============================================================================

/**
 * Authenticate a JWT, and replace `roles` with the per-locale record.
 *
 * Payload's own `local-jwt` loads the user with
 * `payload.findByID({ id, collection, depth })`. It passes no `locale` and no
 * `req`, so `createLocalReq` resolves localized fields at the default locale.
 * This function wraps that strategy instead of reimplementing it. The
 * collection inherits `useSessions: true`, so a hand-rolled copy would have
 * to reproduce the session check, the `_verified` gate, and the autoLogin
 * fallbacks. Each of those three fails closed in a way nobody notices, until
 * someone cannot log in.
 *
 * Registration order keeps this safe: Payload collects custom strategies
 * from the collections first, and appends `local-jwt` LAST.
 * `executeAuthStrategies` returns on the first strategy that yields a user.
 * So this strategy runs in front of the default, instead of replacing it.
 *
 * This handles two failure modes explicitly, because either one would
 * silently restore the bug:
 *
 * 1. **Not this collection's user.** `authStrategies` is one flat global
 *    array, shared across every auth collection, so this strategy also sees
 *    other collections' JWTs. For those, it returns `{ user: null }`, which
 *    lets the loop fall through to `local-jwt`. That is the right answer,
 *    since a non-localized `roles` field needs no hydration.
 *
 * 2. **Hydration failed.** `executeAuthStrategies` SWALLOWS a thrown error
 *    and moves on to the next strategy. Throwing here would hand the request
 *    to `local-jwt`, and quietly reinstate the flat, over-granting shape.
 *    Instead, this returns the user with an empty role record. They see the
 *    "No Projects Available" banner, which is visible and recoverable — far
 *    better than silently receiving their default-locale roles in all 19
 *    locales.
 */
function createLocalizedRolesStrategy(slug: string) {
  return {
    name: LOCALIZED_ROLES_STRATEGY,
    authenticate: async (args: AuthStrategyFunctionArgs): Promise<AuthStrategyResult> => {
      const result = await JWTAuthentication(args)
      const user = result.user

      // This is another auth collection's user, or no user. Let `local-jwt` handle it.
      if (!user || user.collection !== slug) return { user: null }

      try {
        // No `req` here: this runs inside `executeAuthStrategies`, before any
        // operation. There is no transaction to join, and no caller locale to protect.
        const roles = await hydrateLocalizedRoles(args.payload, user.id)
        return { ...result, user: withRoles(user, roles) }
      } catch (err) {
        args.payload.logger.error(
          { err, userId: user.id },
          `[${LOCALIZED_ROLES_STRATEGY}] could not resolve localized roles; ` +
            'denying all role-based access for this request',
        )
        return { ...result, user: withRoles(user, {}) }
      }
    },
  }
}

// ============================================================================
// 2. THE AUTH RESPONSES: fix the user each one re-reads and returns
// ============================================================================

/**
 * Replace `roles` on an auth-response user with the per-locale record.
 *
 * This never throws. An auth response that returns 500 locks the user out of
 * the admin entirely, which is far worse than the flat roles it would fix.
 * On failure, this logs the error and leaves the response as Payload built it.
 *
 * ⚠ **Use `localeIsolatedReq(req)`. Do not use `req` alone, and do not pass
 * nothing.** All three hooks run inside an open transaction. `login.js` opens
 * it at :190 and commits at :321, with `afterLogin` at :263. So the read must
 * JOIN that transaction, rather than take a second pool connection — a busy
 * lane could otherwise hold two connections per login and stop making
 * progress. Passing the caller's own `req` would join the transaction, but
 * would also repoint their `locale` to `'all'` for the rest of the operation
 * (#609). The copy shares `transactionID` by reference, and owns its own
 * `locale` — exactly the pair of properties this needs.
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
      { err, userId: user.id },
      '[localized-roles] could not resolve localized roles for an auth response',
    )
    return user
  }
}

/**
 * `/me`: the admin client calls this on mount, so it decides what the
 * dashboard settles on. This is the load-bearing hook of the three.
 */
const afterMeLocalizedRoles: NonNullable<
  NonNullable<CollectionConfig['hooks']>['afterMe']
>[number] = async ({ req, response }) => {
  const result = response as { user?: AuthUserShape | null } | null
  if (!result?.user) return response

  return { ...result, user: await withLocalizedRoles(result.user, req) }
}

/**
 * `/refresh-token`: fires on the refresh timer. Without this, a user who
 * left a tab open would revert to the flat shape mid-session.
 */
const afterRefreshLocalizedRoles: NonNullable<
  NonNullable<CollectionConfig['hooks']>['afterRefresh']
>[number] = async ({ req, ...rest }) => {
  const result = rest as unknown as { user?: AuthUserShape | null }
  if (!result?.user) return undefined

  return { ...result, user: await withLocalizedRoles(result.user, req) }
}

/**
 * The login response: the very first user the admin holds.
 *
 * ⚠ `afterLogin` runs BEFORE the field-level `afterRead` pass in `login.js`,
 * which resolves localized fields at the request locale. Setting the record
 * here, and letting that pass run afterward, risks flattening it straight
 * back. So this ultimately relies on the `/me` call on mount. This hook stays
 * anyway: it costs one read, and removes a frame of wrong state. The
 * integration test asserts `/me`, which is the load-bearing hook.
 */
const afterLoginLocalizedRoles: NonNullable<
  NonNullable<CollectionConfig['hooks']>['afterLogin']
>[number] = async ({ req, user }) => {
  return await withLocalizedRoles(user as AuthUserShape, req)
}

// ============================================================================
// 3. THE ONE WIRING SITE
// ============================================================================

/**
 * Does this collection actually have the problem?
 *
 * The bug exists only where an AUTH collection stores its `roles` as a
 * LOCALIZED field. That pair is what makes an ordinary read return one
 * locale's roles, where the access checks want every locale's roles.
 * Detecting the pair beats naming `managers` directly: a second auth
 * collection that later gets localized roles would otherwise break in a way
 * nothing announces. And `Clients`, whose `roles` is flat, is correctly
 * skipped for a stated reason, not by accident.
 *
 * ⚠ **Use `flattenTopLevelFields`, not `collection.fields.some`.**
 * `Managers.roles` lives inside a `tabs` field, which is presentational — the
 * data path is still `manager.roles`. A scan of the top-level array alone
 * does not find it, and the whole mechanism goes inert with no announcement.
 * This is not hypothetical: the first version of this check did exactly
 * that, and only the integration lane caught it.
 *
 * Payload's own utility is the right tool, because it makes the distinction
 * that matters here: it flattens presentational containers (tabs, rows,
 * collapsibles), but does NOT descend into `group` or `array`. Their
 * children sit at a different data path, and are not the field
 * `hydrateLocalizedRoles` reads.
 */
function hasLocalizedRoles(collection: CollectionConfig): boolean {
  if (!collection.auth) return false
  return flattenTopLevelFields(collection.fields ?? []).some(
    (field) =>
      'name' in field && field.name === 'roles' && 'localized' in field && field.localized === true,
  )
}

/**
 * Give a collection the strategy and the three hooks, if it needs them.
 *
 * This appends to existing strategies and hooks, rather than replacing
 * them, so a collection keeps whatever it already configured.
 */
export function withLocalizedRoleAuth(collection: CollectionConfig): CollectionConfig {
  if (!hasLocalizedRoles(collection)) return collection

  const auth = typeof collection.auth === 'object' ? collection.auth : {}

  return {
    ...collection,
    auth: {
      ...auth,
      strategies: [...(auth.strategies ?? []), createLocalizedRolesStrategy(collection.slug)],
    },
    hooks: {
      ...collection.hooks,
      afterLogin: [...(collection.hooks?.afterLogin ?? []), afterLoginLocalizedRoles],
      afterMe: [...(collection.hooks?.afterMe ?? []), afterMeLocalizedRoles],
      afterRefresh: [...(collection.hooks?.afterRefresh ?? []), afterRefreshLocalizedRoles],
    },
  }
}
