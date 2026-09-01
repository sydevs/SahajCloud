/**
 * Localized manager roles — producing the per-locale record, and collapsing it
 *
 * `Managers.roles` is a `localized` field, so a manager holds a different set of
 * roles in each locale. Every ordinary read resolves a localized field at ONE
 * locale, so an authenticated manager's `roles` arrives as a flat array for the
 * default locale — never the `Record<LocaleCode, RoleSlug[]>` that the rest of
 * this plugin is written against.
 *
 * That mismatch is the whole of #665, and it fails in both directions: English
 * roles are applied in all 19 locales (over-grant), while a manager with no
 * English roles gets an empty array and is locked out (under-grant). Nothing in
 * `src/` performed the `locale: 'all'` read that produces the record, so the
 * per-locale model documented in `docs/rules/access.md` was inert at runtime.
 *
 * `hydrateLocalizedRoles` is that read. It runs once per authenticated request,
 * in the auth strategy on `Managers`, and again on the three auth responses
 * (`/me`, `refresh-token`, `login`) — which re-read the document themselves, so
 * a strategy-only fix is overwritten the moment the admin client calls `/me`.
 */

import type { RoleScope } from './types'
import type { Payload, PayloadRequest } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import { LOCALES } from '@/lib/locales'
import type { Manager, RoleSlug } from '@/payload-types'


/**
 * A manager's roles, keyed by the locale they were assigned in.
 *
 * Locales the manager holds no role in are absent rather than present-and-empty,
 * so `Object.keys` is directly the set of locales that grant them anything.
 *
 * The element type is taken from `payload-types.ts` rather than restated: only
 * the per-locale KEYING is ours, because Payload generates `Manager['roles']`
 * as the flat array a single-locale read returns and has no way to express what
 * a `locale: 'all'` read produces. Deriving it means a role added to the schema
 * arrives here with no edit.
 */
export type LocalizedRoles = Partial<Record<LocaleCode, NonNullable<Manager['roles']>>>

const LOCALE_ORDER: readonly string[] = LOCALES.map((l) => l.code)

/**
 * The one translation from a request's `locale` to the scope a permission check
 * evaluates — `PayloadRequest['locale']` is a `string | undefined` that also
 * carries `'all'`, and {@link RoleScope} is not.
 *
 * It exists so the mapping is stated once instead of at every call site. It was
 * written out four times before, and the fourth disagreed with the other three:
 * `EventSubmissions` reviewed `?locale=all` under `'union'` (any role in any
 * locale grants) while collection, global and `Frames` access denied it. Same
 * request shape, opposite answer, decided by which file you happened to be in.
 *
 * **`'all'` denies.** A request for every locale at once names no locale to
 * evaluate roles in, and granting it means "any role in any locale grants every
 * locale" — the over-grant #665 exists to remove. `'union'` remains reachable,
 * but only where a caller states it deliberately: admin-UI nav visibility, which
 * Payload invokes with no locale at all.
 *
 * ⚠ **It returns a scope only for a CONFIGURED locale**, and that is a security
 * property rather than tidiness. `req.locale` carries a request-supplied string,
 * and `RoleScope` has one non-locale member — so a cast would let
 * `?locale=union` name the privileged scope directly and hand a manager their
 * roles from every locale at once. Nothing a request says may select `'union'`.
 */
export function roleScopeFromLocale(locale: string | undefined): RoleScope | undefined {
  if (!locale || !LOCALE_ORDER.includes(locale)) return undefined
  return locale as LocaleCode
}

/**
 * Coerce whatever a `locale: 'all'` read returned into a clean per-locale record.
 *
 * Payload omits some locales, and returns `null` for others, depending on how the
 * document was written. Both mean "no roles here", so both are dropped — that is
 * what lets callers treat a present key as a real grant.
 */
export function normalizeLocalizedRoles(value: unknown): LocalizedRoles {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const result: LocalizedRoles = {}
  for (const [locale, roles] of Object.entries(value as Record<string, unknown>)) {
    if (!LOCALE_ORDER.includes(locale)) continue
    if (!Array.isArray(roles) || roles.length === 0) continue
    result[locale as LocaleCode] = roles as NonNullable<Manager['roles']>
  }
  return result
}

/**
 * Re-read a manager's roles at every locale.
 *
 * `overrideAccess` is deliberately left at its default: this runs while the user
 * is being authenticated, so there is no authenticated user to check against yet,
 * and the local API defaults to overriding access for exactly that reason.
 *
 * ⚠ **Pass `req` whenever the caller has one, and pass it through
 * `localeIsolatedReq`.** Both halves of that matter, for opposite reasons:
 *
 * - **With no `req`, this takes its own pool connection.** The three auth-response
 *   hooks run INSIDE an open transaction (`login.js` opens at :190, runs
 *   `afterLogin` at :263, commits at :321; `refresh.js` likewise), so a
 *   connection-less read there holds a second connection while the first is still
 *   held. Under concurrency that exhausts the pool and the lane stops making
 *   progress rather than failing.
 * - **With the caller's own `req`, this would repoint their locale.**
 *   `createLocalReq` assigns `req.locale` onto the object it is given, so
 *   `locale: 'all'` would leak into every later step of that operation — the
 *   defect `src/collections/AGENTS.md` records as #609.
 *
 * `localeIsolatedReq` resolves both: `transactionID` carries by reference so the
 * read joins the existing transaction, while `locale` becomes the copy's own.
 *
 * The auth STRATEGY is the one caller that correctly passes nothing — it runs in
 * `executeAuthStrategies`, before any operation, so there is no transaction to
 * join and no caller locale to protect.
 *
 * Throws whatever the database throws. Callers must not let that fall through to
 * Payload's own JWT strategy — see `localizedRolesAuth`.
 */
export async function hydrateLocalizedRoles(
  payload: Payload,
  managerId: number | string,
  req?: PayloadRequest,
): Promise<LocalizedRoles> {
  const doc = await payload.findByID({
    collection: 'managers',
    depth: 0,
    id: managerId,
    locale: 'all',
    select: { roles: true },
    ...(req ? { req } : {}),
  })

  return normalizeLocalizedRoles((doc as { roles?: unknown } | null)?.roles)
}

/**
 * Every role the manager holds in any locale, de-duplicated.
 *
 * This is what a check with no locale means. It exists for exactly one caller —
 * admin-UI nav visibility (`createHidden`), which Payload invokes with no locale
 * at all. Collapsing to "no roles" there would hide every collection and global
 * from every non-admin manager.
 *
 * It is emphatically NOT the answer for a permission check on a request that has
 * a locale: that is the over-grant this ticket exists to remove.
 */
export function unionRoles(roles: Partial<Record<LocaleCode, readonly RoleSlug[]>>): RoleSlug[] {
  return [...new Set(Object.values(roles).flat())]
}

/**
 * The locales this manager holds at least one role in, most roles first.
 *
 * Ties break on `LOCALES` order, which is already the admin locale dropdown's
 * display order — so the ranking needs no configuration of its own, and the
 * result is deterministic.
 *
 * The first entry is where Payload lands a manager whose current locale grants
 * them nothing (`@payloadcms/next` redirects to `localeCodes[0]` when the active
 * locale is not in the filtered set), so this ordering is the landing locale too.
 */
export function rankLocalesByRoleCount(roles: LocalizedRoles): LocaleCode[] {
  return (Object.keys(roles) as LocaleCode[]).sort((a, b) => {
    const byCount = (roles[b]?.length ?? 0) - (roles[a]?.length ?? 0)
    if (byCount !== 0) return byCount
    return LOCALE_ORDER.indexOf(a) - LOCALE_ORDER.indexOf(b)
  })
}
