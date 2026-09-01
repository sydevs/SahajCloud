/**
 * Making the per-locale role record survive authentication
 *
 * `hydrateLocalizedRoles` produces the record; this file is the four places it
 * has to run so that nothing later flattens it back. All four belong to the
 * access plugin rather than to `Managers`: the per-locale role model is the
 * plugin's, the collection merely stores the field, and a collection that had
 * to remember to wire this up would be a collection that could forget.
 *
 * `withLocalizedRoleAuth` attaches all of it, and `accessPlugin` applies it to
 * every collection that qualifies — so there is exactly one wiring site for the
 * whole mechanism and it is not in a collection file.
 *
 * ## Why four, and not one
 *
 * There is no single extension point that covers them, and the reason is that
 * Payload re-reads the manager at four different moments:
 *
 * | Moment | What re-reads the manager | Without it |
 * | --- | --- | --- |
 * | every authenticated request | `local-jwt`, at the default locale | `req.user.roles` is flat — every server-side access check is wrong |
 * | `POST /api/managers/login` | `login.js` | the first user the admin holds is flat |
 * | `GET /api/managers/me` | `me.js`, at `req.locale` | `AuthProvider` calls it on mount and overwrites the strategy's work — right projects on first paint, then "No Projects Available" |
 * | `POST /api/managers/refresh-token` | `refresh.js`, at `req.locale` | a tab left open reverts mid-session |
 *
 * The strategy fixes the first; the three `after*` hooks fix the rest. Dropping
 * any one of them leaves a reachable path on which the bug is still live, which
 * is why they are four rather than a judgement call — see #665.
 *
 * `afterMe` / `afterRefresh` / `afterLogin` are the correct hooks rather than
 * `me` / `refresh`: the latter short-circuit before token handling.
 */

import type { LocalizedRoles } from './localizedRoles'
import type {
  AuthStrategyFunctionArgs,
  AuthStrategyResult,
  CollectionConfig,
  Field,
  PayloadRequest,
} from 'payload'

import { JWTAuthentication } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { hydrateLocalizedRoles } from './localizedRoles'


type AuthUser = NonNullable<AuthStrategyResult['user']>
type AuthUserShape = { collection?: string; id?: number | string; roles?: unknown }

export const LOCALIZED_ROLES_STRATEGY = 'localized-roles'

/**
 * Attach the per-locale record to an authenticated user.
 *
 * The cast is unavoidable and is the same one `tests/utils/testData.ts`
 * documents: Payload generates `Manager['roles']` as a flat array because that
 * is what a single-locale read returns, and the generated types cannot express
 * the per-locale record a `locale: 'all'` read produces. Every consumer inside
 * this plugin already accepts both shapes (`TypedAuthUser.roles`).
 */
function withRoles<T extends AuthUser>(user: T, roles: LocalizedRoles): T {
  return { ...user, roles } as unknown as T
}

// ============================================================================
// 1. THE AUTH STRATEGY — fixes `req.user` on every authenticated request
// ============================================================================

/**
 * Authenticate a JWT and replace `roles` with the per-locale record.
 *
 * Payload's own `local-jwt` loads the user with
 * `payload.findByID({ id, collection, depth })` — no `locale`, no `req` — so
 * `createLocalReq` resolves localized fields at the default locale. This wraps
 * that strategy rather than reimplementing it: the collection inherits
 * `useSessions: true`, so a hand-rolled copy would have to reproduce the
 * session check, the `_verified` gate and the autoLogin fallbacks — three
 * things that fail closed in ways nobody notices until someone cannot log in.
 *
 * Registration order makes it safe: custom strategies are collected from the
 * collections first and `local-jwt` is appended LAST, and `executeAuthStrategies`
 * returns on the first strategy that yields a user. This runs in front of the
 * default rather than replacing it.
 *
 * Two failure modes are handled explicitly, because both would restore the bug
 * silently:
 *
 * 1. **Not this collection's user.** `authStrategies` is one flat global array
 *    shared across auth collections, so this sees other collections' JWTs too.
 *    It returns `{ user: null }` for them, which lets the loop fall through to
 *    `local-jwt` — the right answer, since a non-localized `roles` field needs
 *    no hydration.
 *
 * 2. **Hydration failed.** `executeAuthStrategies` SWALLOWS a thrown error and
 *    continues to the next strategy, so throwing here would hand the request to
 *    `local-jwt` and quietly reinstate the flat, over-granting shape. Instead
 *    the user is returned with an empty role record: they see the "No Projects
 *    Available" banner, which is visible and recoverable, rather than silently
 *    receiving their default-locale roles in all 19 locales.
 */
function createLocalizedRolesStrategy(slug: string) {
  return {
    name: LOCALIZED_ROLES_STRATEGY,
    authenticate: async (args: AuthStrategyFunctionArgs): Promise<AuthStrategyResult> => {
      const result = await JWTAuthentication(args)
      const user = result.user

      // Another auth collection's user (or unauthenticated) — let `local-jwt` handle it.
      if (!user || user.collection !== slug) return { user: null }

      try {
        // No `req`: this runs in `executeAuthStrategies`, before any operation,
        // so there is no transaction to join and no caller locale to protect.
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
// 2. THE AUTH RESPONSES — fix the user each one re-reads and returns
// ============================================================================

/**
 * Replace `roles` on an auth-response user with the per-locale record.
 *
 * Never throws: an auth response that 500s locks the user out of the admin
 * entirely, which is far worse than the flat roles it would be correcting. A
 * failure leaves the response as Payload built it and is logged.
 *
 * ⚠ **`localeIsolatedReq(req)`, not `req` and not nothing.** All three hooks
 * run inside an open transaction — `login.js` opens at :190 and commits at
 * :321, with `afterLogin` at :263 — so the read has to JOIN that transaction
 * rather than take a second pool connection, or a busy lane can hold two
 * connections per login and stop making progress. Passing the caller's own
 * `req` would join it but also repoint their `locale` to `'all'` for the rest
 * of the operation (#609). The copy shares `transactionID` by reference and
 * owns its `locale`, which is exactly the pair of properties needed here.
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
 * `/me` — the one the admin client calls on mount, and therefore the one that
 * decides what the dashboard settles on. The load-bearing hook of the three.
 */
const afterMeLocalizedRoles: NonNullable<
  NonNullable<CollectionConfig['hooks']>['afterMe']
>[number] = async ({ req, response }) => {
  const result = response as { user?: AuthUserShape | null } | null
  if (!result?.user) return response

  return { ...result, user: await withLocalizedRoles(result.user, req) }
}

/**
 * `/refresh-token` — fires on the refresh timer, so a user who left a tab open
 * would otherwise revert to the flat shape mid-session.
 */
const afterRefreshLocalizedRoles: NonNullable<
  NonNullable<CollectionConfig['hooks']>['afterRefresh']
>[number] = async ({ req, ...rest }) => {
  const result = rest as unknown as { user?: AuthUserShape | null }
  if (!result?.user) return undefined

  return { ...result, user: await withLocalizedRoles(result.user, req) }
}

/**
 * The login response — the very first user the admin holds.
 *
 * ⚠ `afterLogin` runs BEFORE the field-level `afterRead` pass in `login.js`,
 * which resolves localized fields at the request locale. Setting the record
 * here and letting that pass run afterwards risks it being flattened straight
 * back, so the `/me` call on mount is what this ultimately relies on. Kept
 * because it costs one read and removes a frame of wrong state; the integration
 * test asserts `/me`, which is the load-bearing one.
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
 * The bug exists exactly where an AUTH collection stores its `roles` as a
 * LOCALIZED field: that is the pair that makes every ordinary read return one
 * locale's roles where the access checks want all of them. Detecting the pair
 * beats naming `managers`, because a second auth collection acquiring localized
 * roles would otherwise be broken in a way nothing announces — and because
 * `Clients`, whose `roles` is flat, is correctly skipped for a stated reason
 * rather than by omission.
 */
function hasLocalizedRoles(collection: CollectionConfig): boolean {
  if (!collection.auth) return false
  return (collection.fields ?? []).some(
    (field: Field) =>
      'name' in field && field.name === 'roles' && 'localized' in field && field.localized === true,
  )
}

/**
 * Give a collection the strategy and the three hooks, if it needs them.
 *
 * Existing strategies and hooks are preserved — this appends rather than
 * replaces, so a collection keeps whatever it configured for itself.
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
