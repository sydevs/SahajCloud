import type { Payload, PayloadRequest } from 'payload'

import { getLocaleLabel } from '@/lib/locales'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import {
  getRoleOptions,
  getRoleSlugs,
  hydrateLocalizedRoles,
  rankLocalesByRoleCount,
} from '@/plugins/access'

/**
 * What an invitation can honestly say about the access it grants.
 *
 * ⚠ **`roles` and `type` are the whole vocabulary**, because they are the only
 * grants that exist when the invitation renders. `managedPages`,
 * `managedRegions` and `managedEvents` are join fields — the inverse of a
 * relationship declared on the other collection — so nothing points at a
 * manager created one instant ago and all three read empty.
 *
 * ⚠ **Reads `managers` directly**, through `hydrateLocalizedRoles`, so this is
 * the one part of the login plugin that is not generic over its served
 * collection. Per-locale roles are a `managers` model, and no other collection
 * this plugin can serve has one.
 */
export interface LocaleGrant {
  /** The locale's display label, not its code. */
  locale: string
  /** Role labels, as the admin panel spells them. */
  roles: string[]
}

export interface GrantSummary {
  /** An admin holds everything, so no role list applies. */
  fullAccess: boolean
  /** Locales granting at least one role, most roles first. Empty for an admin. */
  grants: LocaleGrant[]
}

/**
 * Every role's label by slug, built once.
 *
 * `getRoleOptions` throws on a slug it does not know, and this runs inside a
 * create that must not roll back — so it is fed `getRoleSlugs()`, which is
 * exactly the set it accepts. A stored value outside that set falls back to the
 * slug rather than throwing.
 */
const ROLE_LABELS = new Map(
  getRoleOptions(getRoleSlugs()).map(({ label, value }) => [value as string, label]),
)

/** The one collection whose grants this can describe. @see summarizeGrants */
const ROLES_COLLECTION = 'managers'

/**
 * Name the access a manager holds, per locale.
 *
 * ⚠ **`req` is passed through `localeIsolatedReq`, and both halves matter.**
 * The read below asks for `locale: 'all'`, and `createLocalReq` assigns
 * `req.locale` onto the object it is handed — so passing the caller's own
 * request would repoint the rest of their operation at `all` (#609). Passing
 * none instead would take a second pool connection while the caller's
 * transaction still holds the first. The copy shares `transactionID` by
 * reference and owns only its locale, which is both.
 *
 * Omit `req` only where there is no transaction to join — a resend, issued from
 * its own request.
 */
export async function summarizeGrants({
  collection,
  id,
  payload,
  req,
  type,
}: {
  /** The served collection the id belongs to. @see ROLES_COLLECTION */
  collection: string
  id: number | string
  payload: Payload
  req?: PayloadRequest
  type: unknown
}): Promise<GrantSummary> {
  // ⚠ **The guard, not a tidiness check.** `hydrateLocalizedRoles` reads
  // `managers` by id, so for any other served collection this would name a
  // stranger's roles — or throw `NotFound` inside the create's own open
  // transaction, which costs the whole account (`invite.ts`).
  if (collection !== ROLES_COLLECTION) return { fullAccess: false, grants: [] }
  if (type === 'admin') return { fullAccess: true, grants: [] }

  const roles = await hydrateLocalizedRoles(payload, id, req ? localeIsolatedReq(req) : undefined)

  return {
    fullAccess: false,
    grants: rankLocalesByRoleCount(roles).map((locale) => ({
      locale: getLocaleLabel(locale),
      roles: (roles[locale] ?? []).map((role) => ROLE_LABELS.get(role) ?? role),
    })),
  }
}
