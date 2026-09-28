import type { CollectionSlug, Field, Payload, PayloadRequest } from 'payload'

import { flattenAllFields } from 'payload'

import { DEFAULT_LOCALE, getLocaleLabel } from '@/lib/locales'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { ProjectSlug } from '@/payload-types'
import {
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

/** One managed document, as the invitation lists it. */
export interface ResponsibilityItem {
  title: string
  /** Its public page, or `null` while it has none — an unpublished event. */
  url: null | string
}

/** One kind of document the account is named on as a manager. */
export interface Responsibility {
  /** The collection's plural label, e.g. `"Regions"`. */
  label: string
  /** The singular, e.g. `"Region"`, for a count of one. */
  singular: string
  /** Every one listed, alphabetically. */
  items: ResponsibilityItem[]
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
 * What was assigned since the last invitation, as the queue stores it on the
 * manager (`pendingInvitation`). A summary given one lists only these — and only
 * those still held when it is read, so an assignment undone in the meantime is
 * not announced.
 */
export interface PendingInvitation {
  /** Role slugs added, per locale code. */
  roles?: Record<string, string[]>
  /** Document ids the manager was named on, per collection slug. */
  managed?: Record<string, (number | string)[]>
  /** The manager whose save assigned the most recent of them. */
  by?: number | string | null
}

/**
 * Every role's label by slug, built once.
 *
 * `getRoleOptions` throws on a slug it does not know, so it is fed
 * `getRoleSlugs()`, which is exactly the set it accepts. A stored value outside
 * that set falls back to the slug rather than throwing.
 */
const ROLE_LABELS = new Map(
  getRoleOptions(getRoleSlugs()).map(({ label, value }) => [value as string, label]),
)

/** The one collection whose grants this can describe. @see summarizeGrants */
export const ROLES_COLLECTION = 'managers'

const NOTHING: GrantSummary = {
  fullAccess: false,
  grants: [],
  responsibilities: [],
  relatedProjects: null,
}

/**
 * The manager joins declared among `fields`: which collection names a manager,
 * and through which of its fields.
 *
 * Takes raw fields so the plugin can read them from the unsanitized config,
 * before Payload flattens anything. A polymorphic join (`collection` as an
 * array) is skipped — there is no one title field to list it by, and `managers`
 * declares none.
 */
export function managerJoins(fields: Field[]): { collection: CollectionSlug; on: string }[] {
  return flattenAllFields({ fields }).flatMap((field) =>
    field.type === 'join' && typeof field.collection === 'string'
      ? [{ collection: field.collection as CollectionSlug, on: field.on }]
      : [],
  )
}

/**
 * Name the access a manager holds: roles per locale, and the documents naming
 * them. Given `only`, just the part of that listed there.
 *
 * ⚠ **`req` is passed through `localeIsolatedReq`, and both halves matter.**
 * The roles read asks for `locale: 'all'`, and `createLocalReq` assigns
 * `req.locale` onto the object it is handed — so passing the caller's own
 * request would repoint the rest of their operation at `all` (#609).
 */
export async function summarizeGrants({
  collection,
  id,
  only,
  payload,
  req,
  type,
}: {
  /** The served collection the id belongs to. @see ROLES_COLLECTION */
  collection: string
  id: number | string
  /** List only these — what was assigned since the last invitation. */
  only?: PendingInvitation
  payload: Payload
  req?: PayloadRequest
  type: unknown
}): Promise<GrantSummary> {
  // ⚠ **The guard, not a tidiness check.** `hydrateLocalizedRoles` reads
  // `managers` by id, so for any other served collection this would name a
  // stranger's roles.
  if (collection !== ROLES_COLLECTION) return NOTHING

  const isolated = req ? localeIsolatedReq(req) : undefined
  const managed = await readManaged(payload, id, isolated, only)
  // An admin holds every role, so none is worth naming — but the regions and
  // events naming them are still theirs to look after.
  const roles =
    type === 'admin' ? {} : narrowRoles(await hydrateLocalizedRoles(payload, id, isolated), only)

  const weights = new Map<ProjectSlug, number>()
  const weigh = (project: ProjectSlug, amount: number) =>
    weights.set(project, (weights.get(project) ?? 0) + amount)

  for (const role of new Set(Object.values(roles).flat())) {
    const project = getRoleProject(role as Parameters<typeof getRoleProject>[0])
    if (project) weigh(project, 1)
  }
  for (const { collection: slug, responsibility } of managed) {
    for (const project of getProjectSlugs()) {
      if ((getProjectCollections(project) as string[]).includes(slug)) {
        weigh(project, responsibility.items.length)
      }
    }
  }

  return {
    fullAccess: type === 'admin',
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

/** The held roles, cut down to the pending ones when there is a pending set. */
function narrowRoles(
  held: Record<string, string[]>,
  only: PendingInvitation | undefined,
): Record<string, string[]> {
  if (!only) return held
  return Object.fromEntries(
    Object.entries(only.roles ?? {})
      .map(([locale, added]) => [
        locale,
        (held[locale] ?? []).filter((role) => added.includes(role)),
      ])
      .filter(([, kept]) => kept.length > 0),
  )
}

/**
 * The documents naming this manager, one entry per `managers` join field — or,
 * given a pending set, the ones in it that still do.
 *
 * Driven by the joins rather than a list of slugs, so a collection that gains a
 * manager relationship — and so a join here — is listed without an edit.
 */
async function readManaged(
  payload: Payload,
  id: number | string,
  req: PayloadRequest | undefined,
  only: PendingInvitation | undefined,
): Promise<{ collection: CollectionSlug; responsibility: Responsibility }[]> {
  const found = []

  for (const join of managerJoins(payload.collections[ROLES_COLLECTION].config.fields)) {
    const ids = only?.managed?.[join.collection]
    if (only && !ids?.length) continue

    const config = payload.collections[join.collection].config
    const titleField = config.admin?.useAsTitle ?? 'id'

    const { docs } = await payload.find({
      collection: join.collection,
      // `in` matches a hasMany `managers` and a single `manager` alike, and
      // re-checking it is what drops an assignment undone since it was queued.
      where: {
        and: [{ [join.on]: { in: [id] } }, ...(ids ? [{ id: { in: ids } }] : [])],
      },
      pagination: false,
      sort: titleField,
      depth: 0,
      // The email's copy is English, so its titles are too, falling back where
      // a localized title was never written in English.
      locale: DEFAULT_LOCALE,
      overrideAccess: true,
      req,
    })

    const items = docs.flatMap((doc) => {
      const record = doc as unknown as Record<string, unknown>
      // A finished event keeps its page for late visitors, but it is over —
      // nothing to look after.
      if (record.verificationStage === 'finished') return []
      const title = record[titleField]
      return [
        {
          title: typeof title === 'string' && title.trim() ? title : 'Untitled',
          url: typeof record.webUrl === 'string' ? record.webUrl : null,
        },
      ]
    })
    if (items.length === 0) continue

    const { plural, singular } = config.labels ?? {}
    found.push({
      collection: join.collection,
      responsibility: {
        label: typeof plural === 'string' ? plural : join.collection,
        singular: typeof singular === 'string' ? singular : join.collection,
        items,
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
  // An account this cannot describe has only its own choice to go on.
  if (summary.relatedProjects === null) return current
  if (current && summary.relatedProjects.includes(current)) return current
  // An admin relates to every project, so their own choice stands when the
  // listing names nothing.
  if (summary.fullAccess && summary.relatedProjects.length === 0) return current
  return summary.relatedProjects[0]
}
