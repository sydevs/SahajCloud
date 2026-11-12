import type { CollectionSlug, Field, Payload, PayloadRequest, Where } from 'payload'

import { flattenAllFields } from 'payload'

import type { EventListingProgress } from '@/emails/EventVerificationEmail'
import { computeCommunityVerdict } from '@/lib/eventVerification/communityFeedback'
import { DEFAULT_LOCALE, getLocaleLabel } from '@/lib/locales'
import { addressOneLine, scheduleOneLine } from '@/lib/notifications/eventDetails'
import { buildEventListingProgress } from '@/lib/notifications/listingProgress'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { Event, ProjectSlug } from '@/payload-types'
import {
  getJoinProject,
  getProjectCollections,
  getProjectSlugs,
  getRoleLabel,
  getRoleProject,
  getRoleSlugs,
  hydrateLocalizedRoles,
  rankLocalesByRoleCount,
} from '@/plugins/access'
import { DEFAULT_EMAIL_PROJECT } from '@/plugins/email'

/**
 * What an invitation can honestly say about the access it grants.
 *
 * Two vocabularies: the account's `roles` and `type`, and the documents that
 * name it as a manager — the targets of the `managedPages`, `managedRegions`,
 * `managedEvents` and `managedClients` joins.
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
  /**
   * For a class: what its listing says, how complete it is, and whether the
   * community had voted it down before a manager took it on.
   *
   * ⚠ **One email, not two.** Adopting a listing used to send an invitation
   * naming the class and nothing else, leaving the new manager to open the
   * admin to find out what they had taken on — and leaving a listing the
   * community had flagged indistinguishable from any other (#1120 decision 4).
   * A second email would be the obvious fix and the wrong one: it arrives
   * beside the first, about the same class.
   */
  event?: {
    /** One line each, the same shapes the reminder email prints. */
    schedule: string
    locationLabel: 'Address' | 'Online'
    location: string
    /** Contact name · phone, when the listing carries either. */
    contact?: string
    /** The listing checklist, exactly as the reminder email computes it. */
    progress: EventListingProgress | null
    /** Attendees had denied this class before it was adopted. */
    flagged: boolean
  }
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

/** One project's part of what an account holds — the content of one invitation. */
export interface GrantSummary {
  /** The project this part belongs to, and so its brand. `undefined` takes the default. */
  project: ProjectSlug | undefined
  /** An admin holds everything, so no role list applies. */
  fullAccess: boolean
  /** Locales granting at least one of this project's roles, most roles first. */
  grants: LocaleGrant[]
  /** Each kind of this project's managed documents, in the collection's join order. */
  responsibilities: Responsibility[]
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
 * ⚠ Not `getRoleOptions`, which refuses a derived role and would throw here on
 * the full slug set. A stored value outside that set falls back to the slug
 * rather than throwing.
 */
const ROLE_LABELS = new Map(getRoleSlugs().map((slug) => [slug as string, getRoleLabel(slug)]))

/** The one collection whose grants this can describe. @see summarizeGrants */
export const MANAGERS_COLLECTION = 'managers'

/**
 * The manager joins declared among `fields`: which collection names a manager,
 * through which of its fields, and which of its documents count.
 *
 * Takes raw fields so the plugin can read them from the unsanitized config,
 * before Payload flattens anything. A polymorphic join (`collection` as an
 * array) is skipped — there is no one title field to list it by, and `managers`
 * declares none.
 */
export function managerJoins(
  fields: Field[],
): { collection: CollectionSlug; name: string; on: string; where?: Where }[] {
  return flattenAllFields({ fields }).flatMap((field) =>
    field.type === 'join' && typeof field.collection === 'string'
      ? [
          {
            collection: field.collection as CollectionSlug,
            name: field.name,
            on: field.on,
            where: field.where,
          },
        ]
      : [],
  )
}

/**
 * How one kind of managed document is named: the singular for a count of one,
 * the plural otherwise.
 *
 * The invitation email's list and the preview sign-in picker both label a row
 * this way, so one rule is what keeps them agreeing. `inviteHeading` is not a
 * third caller: its subject counts the items instead ("1 region", "4 events"),
 * lowercase.
 */
export const responsibilityLabel = (responsibility: Responsibility): string =>
  responsibility.items.length === 1 ? responsibility.singular : responsibility.label

/**
 * Name the access a manager holds — roles per locale, and the documents naming
 * them — as one summary per project, in project order. Given `only`, just the
 * part of that listed there.
 *
 * ⚠ **One summary per project, because one invitation per project.** A brand,
 * an introduction and a heading can only speak for one product, so an Atlas
 * event and a We Meditate page assigned together are two emails. A role goes
 * with its own project. A document goes with its collection's project; a
 * collection in several (pages, in both We Meditate projects) goes with one the
 * account holds a role in, and otherwise the first. An account with nothing to
 * name gets one empty summary, for its current project if it is an admin.
 *
 * ⚠ **`req` is passed through `localeIsolatedReq`, and both halves matter.**
 * The roles read asks for `locale: 'all'`, and `createLocalReq` assigns
 * `req.locale` onto the object it is handed — so passing the caller's own
 * request would repoint the rest of their operation at `all` (#609).
 */
export async function summarizeGrants({
  collection,
  current,
  id,
  describeEvents = false,
  only,
  payload,
  req,
  type,
}: {
  /** The served collection the id belongs to. @see MANAGERS_COLLECTION */
  collection: string
  /**
   * Also describe each class: what it says, how complete it is, whether the
   * community had flagged it.
   *
   * ⚠ **Off by default, because the other caller renders none of it.** The
   * preview sign-in picker summarises up to 25 accounts, one after another, to
   * print a single line each — paying for a listing checklist per class there
   * would be a page load's worth of work nothing displays.
   */
  describeEvents?: boolean
  /** The account's own current project, which an admin's empty summary keeps. */
  current?: ProjectSlug
  id: number | string
  /** List only these — what was assigned since the last invitation. */
  only?: PendingInvitation
  payload: Payload
  req?: PayloadRequest
  type: unknown
}): Promise<GrantSummary[]> {
  const fullAccess = type === 'admin'
  const empty: GrantSummary[] = [
    { project: fullAccess ? current : undefined, fullAccess, grants: [], responsibilities: [] },
  ]
  // ⚠ **The guard, not a tidiness check.** `hydrateLocalizedRoles` reads
  // `managers` by id, so for any other served collection this would name a
  // stranger's roles.
  if (collection !== MANAGERS_COLLECTION) return [{ ...empty[0]!, project: current }]

  const isolated = req ? localeIsolatedReq(req) : undefined
  const managed = await readManaged(payload, id, isolated, only, describeEvents)
  // An admin holds every role, so none is worth naming — but the regions and
  // events naming them are still theirs to look after.
  const held = fullAccess ? {} : await hydrateLocalizedRoles(payload, id, isolated)
  const roles = narrowRoles(held, only)

  const roleProject = (role: string) => getRoleProject(role as Parameters<typeof getRoleProject>[0])
  const heldProjects = new Set(Object.values(held).flat().map(roleProject))

  const parts = new Map<
    ProjectSlug,
    { roles: Record<string, string[]>; responsibilities: Responsibility[] }
  >()
  const part = (project: ProjectSlug) => {
    if (!parts.has(project)) parts.set(project, { roles: {}, responsibilities: [] })
    return parts.get(project)!
  }

  for (const [locale, slugs] of Object.entries(roles)) {
    for (const slug of slugs) {
      const project = roleProject(slug)
      if (project) (part(project).roles[locale] ??= []).push(slug)
    }
  }
  for (const { collection: slug, join, responsibility } of managed) {
    const candidates = getProjectSlugs().filter((project) =>
      (getProjectCollections(project) as string[]).includes(slug),
    )
    // A collection in no project — `clients` is restricted — goes with the
    // project of the role its listing derives, so a service is a Sahaj Atlas
    // invitation rather than the default brand's.
    const project =
      candidates.find((candidate) => heldProjects.has(candidate)) ??
      candidates[0] ??
      getJoinProject(join) ??
      DEFAULT_EMAIL_PROJECT
    part(project).responsibilities.push(responsibility)
  }

  if (parts.size === 0) return empty
  return getProjectSlugs().flatMap((project) => {
    const found = parts.get(project)
    if (!found) return []
    return [
      {
        project,
        fullAccess,
        grants: rankLocalesByRoleCount(found.roles).map((locale) => ({
          locale: getLocaleLabel(locale),
          roles: (found.roles[locale] ?? []).map((role) => ROLE_LABELS.get(role) ?? role),
        })),
        responsibilities: found.responsibilities,
      },
    ]
  })
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
  describeEvents: boolean,
): Promise<{ collection: CollectionSlug; join: string; responsibility: Responsibility }[]> {
  const found = []

  for (const join of managerJoins(payload.collections[MANAGERS_COLLECTION].config.fields)) {
    const ids = only?.managed?.[join.collection]
    if (only && !ids?.length) continue

    const config = payload.collections[join.collection].config
    const titleField = config.admin?.useAsTitle ?? 'id'

    const { docs } = await payload.find({
      collection: join.collection,
      // `in` matches a hasMany `managers` and a single `manager` alike, and
      // re-checking it is what drops an assignment undone since it was queued.
      // The join's own `where` too, so a document it does not count — an app's
      // key, on `managedClients` — is never announced.
      where: {
        and: [
          { [join.on]: { in: [id] } },
          ...(join.where ? [join.where] : []),
          ...(ids ? [{ id: { in: ids } }] : []),
        ],
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

    const describing = describeEvents && join.collection === 'events'
    const items: ResponsibilityItem[] = (
      await Promise.all(
        docs.map(async (doc) => {
          const record = doc as unknown as Record<string, unknown>
          // A finished event keeps its page for late visitors, but it is over —
          // nothing to look after.
          if (record.verificationStage === 'finished') return []
          const title = record[titleField]
          return [
            {
              title: typeof title === 'string' && title.trim() ? title : 'Untitled',
              url: typeof record.webUrl === 'string' ? record.webUrl : null,
              ...(describing ? { event: await describeEvent(doc as unknown as Event, req) } : {}),
            },
          ]
        }),
      )
    ).flat()
    if (items.length === 0) continue

    const { plural, singular } = config.labels ?? {}
    found.push({
      collection: join.collection,
      join: join.name,
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
 * What a new manager needs to know about a class they have just been given.
 *
 * ⚠ **The three lines are composed here, not taken from
 * `buildEventEmailDetails`.** That builder's only query counts recent
 * registrations, which this email does not print — and one of its callers is
 * the anonymous `request-magic-link` rescue path, where it would be the whole
 * of the I/O and all of it wasted.
 *
 * The checklist does come from the same builder the reminder email uses, so
 * what an adoption asks for and what the first reminder asks for cannot be two
 * different lists. A listing the quality registry skips is `null`, and the
 * email leaves the section out.
 *
 * `flagged` reads the stored vote tally rather than the stage: by the time this
 * runs the adoption has already moved the class to `verified`, so `denied` is
 * no longer there to read, and the denials that put it there are. It re-runs
 * the verdict that unpublished it, because a bare denial count would tell a
 * manager a listing nobody ever took down was off the map.
 */
async function describeEvent(
  event: Event,
  /** Absent only where the caller holds no request — the checklist needs one. */
  req: PayloadRequest | undefined,
): Promise<ResponsibilityItem['event']> {
  const online = event.eventType === 'online'
  const contact = [event.contactName?.trim(), event.contactPhone?.trim()]
    .filter(Boolean)
    .join(' · ')
  return {
    schedule: scheduleOneLine(event.schedule),
    locationLabel: online ? 'Online' : 'Address',
    location: online ? (event.onlineUrl ?? '') : addressOneLine(event.address ?? {}),
    ...(contact ? { contact } : {}),
    progress: req ? await buildEventListingProgress({ event, req }).catch(() => null) : null,
    flagged: computeCommunityVerdict({
      confirmations: event.systemMeta?.communityFeedback?.confirmations ?? 0,
      denials: event.systemMeta?.communityFeedback?.denials ?? 0,
    }).denied,
  }
}
