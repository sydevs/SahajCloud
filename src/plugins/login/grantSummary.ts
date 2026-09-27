import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import { DEFAULT_LOCALE, getLocaleLabel } from '@/lib/locales'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { ProjectSlug } from '@/payload-types'
import {
  getDocManagerFields,
  getProjectCollections,
  getProjectSlugs,
  getRoleOptions,
  getRoleProject,
  getRoleSlugs,
  hydrateLocalizedRoles,
  rankLocalesByRoleCount,
} from '@/plugins/access'

/**
 * What an invitation can honestly say about the access it grants.
 *
 * Two vocabularies: the account's `roles` and `type`, and the documents that
 * name it as a manager — the targets of the `managedPages`, `managedRegions`
 * and `managedEvents` joins.
 *
 * ⚠ **The joins are empty when a create sends the invitation.** Each is the
 * inverse of a relationship declared on the other collection, and nothing can
 * point at an account created one instant ago. So only a resend lists them —
 * which is how an imported Atlas manager, named on regions and events before
 * anything mailed them, receives theirs.
 *
 * ⚠ **Reads `managers` directly**, through `hydrateLocalizedRoles` and the
 * collection's join fields, so this is the one part of the login plugin that is
 * not generic over its served collection. No other collection it can serve has
 * per-locale roles or manager joins.
 */
export interface LocaleGrant {
  /** The locale's display label, not its code. */
  locale: string
  /** Role labels, as the admin panel spells them. */
  roles: string[]
}

/** One kind of document the account is named on as a manager. */
export interface Responsibility {
  /** The collection's plural label, e.g. `"Regions"`. */
  label: string
  /** The first {@link LISTED_PER_KIND} titles, alphabetically. */
  titles: string[]
  /** How many more there are beyond `titles`. */
  more: number
  /** Whether managing one also manages everything nested under it. */
  nested: boolean
}

export interface GrantSummary {
  /** An admin holds everything, so no role list applies. */
  fullAccess: boolean
  /** Locales granting at least one role, most roles first. Empty for an admin. */
  grants: LocaleGrant[]
  /** Each kind of managed document, in the collection's join order. */
  responsibilities: Responsibility[]
  /**
   * The projects what is listed belongs to, most first. `null` where the
   * summary cannot describe the account at all. @see brandProject
   */
  relatedProjects: ProjectSlug[] | null
}

/**
 * How many titles an invitation lists per kind. An Atlas manager can own dozens
 * of events, and the email is a welcome, not an inventory.
 */
export const LISTED_PER_KIND = 5

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

const NOTHING: GrantSummary = {
  fullAccess: false,
  grants: [],
  responsibilities: [],
  relatedProjects: null,
}

/**
 * Name the access a manager holds: roles per locale and, when asked, the
 * documents they manage.
 *
 * ⚠ **`req` is passed through `localeIsolatedReq`, and both halves matter.**
 * The roles read asks for `locale: 'all'`, and `createLocalReq` assigns
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
  withResponsibilities,
}: {
  /** The served collection the id belongs to. @see ROLES_COLLECTION */
  collection: string
  id: number | string
  payload: Payload
  req?: PayloadRequest
  type: unknown
  /** Read the managed documents too. Pointless inside a create — see above. */
  withResponsibilities: boolean
}): Promise<GrantSummary> {
  // ⚠ **The guard, not a tidiness check.** `hydrateLocalizedRoles` reads
  // `managers` by id, so for any other served collection this would name a
  // stranger's roles — or throw `NotFound` inside the create's own open
  // transaction, which costs the whole account (`invite.ts`).
  if (collection !== ROLES_COLLECTION) return NOTHING
  if (type === 'admin') return { ...NOTHING, fullAccess: true }

  const isolated = req ? localeIsolatedReq(req) : undefined
  const roles = await hydrateLocalizedRoles(payload, id, isolated)
  const managed = withResponsibilities ? await readManaged(payload, id, isolated) : []

  const weights = new Map<ProjectSlug, number>()
  const weigh = (project: ProjectSlug, amount: number) =>
    weights.set(project, (weights.get(project) ?? 0) + amount)

  for (const role of new Set(Object.values(roles).flat())) {
    const project = getRoleProject(role as Parameters<typeof getRoleProject>[0])
    if (project) weigh(project, 1)
  }
  for (const { collection: slug, count } of managed) {
    for (const project of getProjectSlugs()) {
      if ((getProjectCollections(project) as string[]).includes(slug)) weigh(project, count)
    }
  }

  return {
    fullAccess: false,
    grants: rankLocalesByRoleCount(roles).map((locale) => ({
      locale: getLocaleLabel(locale),
      roles: (roles[locale] ?? []).map((role) => ROLE_LABELS.get(role) ?? role),
    })),
    responsibilities: managed.map(({ responsibility }) => responsibility),
    // `sort` is stable, so a tie keeps `getProjectSlugs()` order.
    relatedProjects: getProjectSlugs()
      .filter((project) => weights.has(project))
      .sort((a, b) => weights.get(b)! - weights.get(a)!),
  }
}

/**
 * The documents naming this manager, one entry per `managers` join field.
 *
 * Driven by the joins rather than a list of slugs, so a collection that gains a
 * manager relationship — and so a join here — is listed without an edit.
 */
async function readManaged(
  payload: Payload,
  id: number | string,
  req: PayloadRequest | undefined,
): Promise<{ collection: CollectionSlug; count: number; responsibility: Responsibility }[]> {
  // A polymorphic join (`collection` as an array) has no one title field to
  // list by. `managers` declares none.
  const joins = payload.collections[ROLES_COLLECTION].config.flattenedFields.flatMap((field) =>
    field.type === 'join' && typeof field.collection === 'string'
      ? [{ collection: field.collection as CollectionSlug, on: field.on }]
      : [],
  )
  const found = []

  for (const join of joins) {
    const config = payload.collections[join.collection].config
    const titleField = config.admin?.useAsTitle ?? 'id'

    const { docs, totalDocs } = await payload.find({
      collection: join.collection,
      // `in` matches a hasMany `managers` and a single `manager` alike.
      where: { [join.on]: { in: [id] } },
      limit: LISTED_PER_KIND,
      sort: titleField,
      depth: 0,
      // The email's copy is English, so its titles are too, falling back where
      // a localized title was never written in English.
      locale: DEFAULT_LOCALE,
      select: { [titleField]: true },
      overrideAccess: true,
      req,
    })
    if (totalDocs === 0) continue

    const plural = config.labels?.plural
    found.push({
      collection: join.collection,
      count: totalDocs,
      responsibility: {
        label: typeof plural === 'string' ? plural : join.collection,
        titles: docs.map((doc) => {
          const title = (doc as unknown as Record<string, unknown>)[titleField]
          return typeof title === 'string' && title.trim() ? title : 'Untitled'
        }),
        more: totalDocs - docs.length,
        // The same test document-level access uses to inherit a manager down
        // the tree, so the note cannot claim more than access grants.
        nested: Boolean(getDocManagerFields(payload, join.collection).parentField),
      },
    })
  }

  return found
}

/**
 * The project an invitation is branded for.
 *
 * The account's own current project wins when it relates to something the
 * invitation lists. Otherwise the project most of the listing belongs to does,
 * so an Atlas manager never receives a We Meditate invitation — and the reverse.
 * An invitation that lists nothing takes the default brand.
 */
export function brandProject(
  current: ProjectSlug | undefined,
  summary: GrantSummary,
): ProjectSlug | undefined {
  // An admin relates to every project, and an account this cannot describe has
  // only its own choice to go on.
  if (summary.fullAccess || summary.relatedProjects === null) return current
  if (current && summary.relatedProjects.includes(current)) return current
  return summary.relatedProjects[0]
}
