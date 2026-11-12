/**
 * The manager invitation: what it may claim, how it is branded, and what it
 * mints (#839).
 *
 * Reachable without a Payload bootstrap:
 *
 * - `summarizeGrants` — the roles and managed documents an invitation names,
 *   split by project, narrowed to what was newly assigned when the queue sends
 *   it, and the locale isolation that keeps its roles read from repointing a
 *   caller's request.
 * - `composeInvitations` — the emails: one per project, the button's target,
 *   and the AUDIENCE of the token in it, asserted on the wire rather than the
 *   template.
 *
 * ⚠ The fake `payload` below emulates `createLocalReq`'s one load-bearing
 * behaviour: it assigns `locale` onto the request object it is handed. Without
 * that, the isolation test would pass against the defect it exists to catch.
 */
import type { Payload, PayloadRequest } from 'payload'

import { decodeJwt } from 'jose'
import { describe, expect, it } from 'vitest'

import { managersLogin, MANAGER_SIGNIN_PATH } from '@/collections/Managers/login'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { INVITE_VALID_FOR, readInviteToken, readLinkToken, summarizeGrants } from '@/plugins/login'
import { composeInvitations } from '@/plugins/login/invite'

const SECRET = 'invite-spec-secret'

/** The one collection the summary can describe. Spread into every call below. */
const managers = { collection: 'managers', id: 1 }

type Where = { and?: { id?: { in?: number[] } }[] }
type FindArgs = {
  collection?: string
  locale?: string
  req?: { locale?: string; transactionID?: string }
  select?: Record<string, true>
  where?: Where
}

/** A managed document: its id, title, public page, and (for events) its stage. */
type Doc = {
  id: number
  title: string
  url?: string
  verificationStage?: string
  /** The stored vote tally, which is what says a class was adopted after a denial. */
  systemMeta?: { communityFeedback?: { confirmations: number; denials: number } }
}
type Managed = Partial<Record<'events' | 'pages' | 'regions', Doc[]>>

/**
 * The three joins `Managers` declares and the target collections' config, as
 * far as the summary reads them. Regions nest, so they carry the
 * self-referential `parent` field document-level access inherits through.
 */
const collection = (plural: string, singular: string, titleField: string, nests = false) => ({
  config: {
    admin: { useAsTitle: titleField },
    labels: { plural, singular },
    fields: [],
    flattenedFields: nests ? [{ name: 'parent', type: 'relationship', relationTo: 'regions' }] : [],
  },
})

const COLLECTIONS = {
  managers: {
    config: {
      fields: [
        { name: 'roles', type: 'select', options: [] },
        { name: 'managedPages', type: 'join', collection: 'pages', on: 'managers' },
        { name: 'managedRegions', type: 'join', collection: 'regions', on: 'managers' },
        { name: 'managedEvents', type: 'join', collection: 'events', on: 'manager' },
      ],
    },
  },
  pages: collection('Pages', 'Page', 'title'),
  regions: collection('Regions', 'Region', 'name', true),
  events: collection('Events', 'Event', 'title'),
}

/** A `payload` answering the roles read, and a `find` per managed collection. */
function fakePayload(roles: unknown, managed: Managed = {}) {
  const reads: FindArgs[] = []

  const payload = {
    secret: SECRET,
    collections: COLLECTIONS,
    findByID: async (args: FindArgs) => {
      reads.push(args)
      // What `createLocalReq` does, and the whole reason `localeIsolatedReq`
      // exists: the locale is written onto the caller's own request object.
      if (args.req && args.locale) args.req.locale = args.locale
      return { roles }
    },
    find: async (args: FindArgs) => {
      reads.push(args)
      const only = args.where?.and?.[1]?.id?.in
      const titleField = args.collection === 'regions' ? 'name' : 'title'
      const docs = (managed[args.collection as keyof Managed] ?? [])
        .filter((doc) => !only || only.includes(doc.id))
        .map((doc) => ({
          id: doc.id,
          [titleField]: doc.title,
          webUrl: doc.url ?? null,
          verificationStage: doc.verificationStage,
          systemMeta: doc.systemMeta,
        }))
      return { docs }
    },
  } as unknown as Payload

  return { payload, reads }
}

const BERLIN: Doc = { id: 1, title: 'Berlin', url: 'https://atlas.test/berlin' }
const TUESDAY: Doc = { id: 7, title: 'Tuesday Evening Meditation', url: 'https://atlas.test/7' }
const DRAFT: Doc = { id: 8, title: 'Sunday Workshop' }
const FINISHED: Doc = { id: 9, title: 'Summer Retreat', verificationStage: 'finished' }
/** Adopted after the community voted it down — the tally is what survives the adoption. */
const FLAGGED: Doc = {
  id: 10,
  title: 'Thursday Morning',
  systemMeta: { communityFeedback: { confirmations: 0, denials: 6 } },
}
/** One dissenter among twenty: below the threshold, so it was never taken down. */
const DISPUTED: Doc = {
  id: 11,
  title: 'Friday Evening',
  systemMeta: { communityFeedback: { confirmations: 20, denials: 1 } },
}

describe('summarizeGrants', () => {
  const summarize = (roles: unknown, managed: Managed = {}, extra: Record<string, unknown> = {}) =>
    summarizeGrants({
      ...managers,
      payload: fakePayload(roles, managed).payload,
      type: 'manager',
      ...extra,
    })

  it('renders role LABELS per locale, most roles first', async () => {
    const [app] = await summarize({ en: ['meditations-editor'], fr: ['path-editor'] })

    // Path Editor and Meditations Editor are both We Meditate App roles.
    expect(app).toMatchObject({
      project: 'wemeditate-app',
      grants: [
        { locale: 'English', roles: ['Meditations Editor'] },
        { locale: 'French', roles: ['Path Editor'] },
      ],
    })
  })

  it('lists every document naming the manager, linked where it is public', async () => {
    // No stored role: on Sahaj Atlas the listings below ARE the role, so the
    // summary names them and has no grant to report.
    const { payload, reads } = fakePayload({}, { regions: [BERLIN], events: [TUESDAY, DRAFT] })

    const [atlas, ...rest] = await summarizeGrants({ ...managers, payload, type: 'manager' })

    expect(rest).toEqual([])
    expect(atlas).toEqual({
      project: 'sahaj-atlas',
      fullAccess: false,
      grants: [],
      responsibilities: [
        { label: 'Regions', singular: 'Region', items: [{ title: 'Berlin', url: BERLIN.url }] },
        {
          label: 'Events',
          singular: 'Event',
          // No brief: `describeEvents` is off unless the caller renders one.
          items: [
            { title: TUESDAY.title, url: TUESDAY.url },
            { title: DRAFT.title, url: null },
          ],
        },
      ],
    })
    // Each join asks its own collection for the documents naming this manager.
    expect(reads.find((read) => read.collection === 'events')?.where?.and?.[0]).toEqual({
      manager: { in: [1] },
    })
    expect(reads.find((read) => read.collection === 'regions')?.where?.and?.[0]).toEqual({
      managers: { in: [1] },
    })
  })

  it('marks a class the community had voted down, from the tally the adoption left', async () => {
    const { payload } = fakePayload(
      {},
      { events: [TUESDAY, FLAGGED, DISPUTED], regions: [BERLIN] },
    )

    // ⚠ Only the invitation asks for a brief: the preview sign-in picker
    // summarises up to 25 accounts to print one line each, and would pay for a
    // listing checklist per class it renders nothing from.
    const [atlas] = await summarizeGrants({
      ...managers,
      describeEvents: true,
      payload,
      type: 'manager',
    })
    const items = atlas!.responsibilities.find((r) => r.label === 'Events')!.items

    // A region has no listing to describe.
    expect(
      atlas!.responsibilities.find((r) => r.label === 'Regions')!.items[0]!.event,
    ).toBeUndefined()

    // The adoption already moved it to `verified`, so the stage cannot say this
    // and the stored denials are what do.
    expect(items.find((item) => item.title === FLAGGED.title)!.event!.flagged).toBe(true)
    expect(items.find((item) => item.title === TUESDAY.title)!.event!.flagged).toBe(false)

    // The email's flagged line says the class was taken off the map, so it has
    // to ask what took it off: one denial among twenty never reached the
    // threshold, and the listing stood throughout.
    expect(items.find((item) => item.title === DISPUTED.title)!.event!.flagged).toBe(false)
  })

  it('splits what it names by project — one invitation each', async () => {
    const parts = await summarize(
      { fr: ['web-translator'] },
      { events: [TUESDAY], pages: [{ id: 3, title: 'About' }] },
    )

    expect(parts.map((part) => part.project)).toEqual(['wemeditate-web', 'sahaj-atlas'])
    expect(parts[0]).toMatchObject({
      grants: [{ locale: 'French', roles: ['Web Translator'] }],
      responsibilities: [{ label: 'Pages' }],
    })
    expect(parts[1]).toMatchObject({
      grants: [],
      responsibilities: [{ label: 'Events' }],
    })
  })

  it('files pages under the We Meditate project the manager holds a role in', async () => {
    // Pages sit in both We Meditate projects. A Path Editor's go with the App.
    const [part] = await summarize(
      { en: ['path-editor'] },
      { pages: [{ id: 3, title: 'About' }] },
      {
        only: { managed: { pages: [3] } },
      },
    )

    expect(part?.project).toBe('wemeditate-app')
  })

  it('files pages under We Meditate Web when no role says otherwise', async () => {
    const [part] = await summarize({}, { pages: [{ id: 3, title: 'About' }] })

    expect(part?.project).toBe('wemeditate-web')
  })

  it('leaves out a finished event — there is nothing left to look after', async () => {
    const [part] = await summarize({}, { events: [TUESDAY, FINISHED] })

    expect(part?.responsibilities[0]?.items.map((item) => item.title)).toEqual([TUESDAY.title])
  })

  it('names only what was queued, and only while it is still held', async () => {
    const parts = await summarize(
      { en: ['web-translator'] },
      { regions: [BERLIN], events: [TUESDAY, DRAFT] },
      {
        only: {
          // `path-editor` was queued, then taken away before the send. The
          // held `web-translator` and Berlin were never queued, so neither is
          // named either.
          roles: { en: ['path-editor'] },
          managed: { events: [TUESDAY.id] },
        },
      },
    )

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      project: 'sahaj-atlas',
      grants: [],
      responsibilities: [{ items: [{ title: TUESDAY.title, url: TUESDAY.url }] }],
    })
  })

  it('names full access for an admin and reads no roles — but still lists what they manage', async () => {
    const { payload, reads } = fakePayload({ en: ['meditations-editor'] }, { regions: [BERLIN] })

    const [part] = await summarizeGrants({ ...managers, payload, type: 'admin' })

    expect(part).toMatchObject({ project: 'sahaj-atlas', fullAccess: true, grants: [] })
    expect(part?.responsibilities[0]?.items[0]?.title).toBe('Berlin')
    expect(reads.some((read) => read.select?.roles)).toBe(false)
  })

  it('gives an admin with nothing to list one summary, under their own project', async () => {
    const parts = await summarizeGrants({
      ...managers,
      current: 'sahaj-atlas',
      payload: fakePayload({}).payload,
      type: 'admin',
    })

    expect(parts).toEqual([
      { project: 'sahaj-atlas', fullAccess: true, grants: [], responsibilities: [] },
    ])
  })

  it('describes nothing for a collection whose roles it cannot read', async () => {
    // `hydrateLocalizedRoles` reads `managers` by id. For any other served
    // collection that would be a stranger's roles — so it must not read at all.
    const { payload, reads } = fakePayload({ en: ['path-editor'] })

    const parts = await summarizeGrants({ collection: 'clients', id: 1, payload, type: 'manager' })

    expect(parts).toEqual([
      { project: undefined, fullAccess: false, grants: [], responsibilities: [] },
    ])
    expect(reads).toHaveLength(0)
  })

  it('leaves the caller’s own locale alone', async () => {
    const { payload, reads } = fakePayload({ en: ['path-editor'] })
    const req = { locale: 'de' } as PayloadRequest

    await summarizeGrants({ ...managers, payload, req, type: 'manager' })

    // The read asked for every locale...
    expect(reads.find((read) => read.select?.roles)?.locale).toBe('all')
    // ...on a COPY, so the operation that called us keeps its own (#609).
    expect(req.locale).toBe('de')
  })
})

describe('composeInvitations', () => {
  const doc = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    email: 'jo@example.com',
    name: 'Jo',
    type: 'manager',
    currentProject: null,
    _verified: false,
    ...overrides,
  })

  const compose = (roles: unknown, managed: Managed, overrides?: Record<string, unknown>) =>
    composeInvitations({
      config: managersLogin,
      doc: doc(overrides),
      payload: fakePayload(roles, managed).payload,
    })

  it('invites an unaccepted account through the sign-in page, never Payload’s verify route', async () => {
    const [invitation] = await compose({}, { regions: [BERLIN] })

    const match = invitation?.html.match(
      new RegExp(`${getServerUrl()}${MANAGER_SIGNIN_PATH}\\?token=([\\w.%-]+)`),
    )
    expect(match, 'no invitation link in the body').not.toBeNull()
    expect(invitation?.html).not.toContain('/admin/managers/verify/')

    const token = decodeURIComponent(match![1]!)
    expect(decodeJwt(token).aud).toBe('manager-invite')
    const result = await readInviteToken(token, SECRET)
    expect(result.status === 'valid' && result.claims).toMatchObject({
      collection: 'managers',
      userId: 7,
    })
  })

  it('gives an accepted account a sign-in link to its notification settings', async () => {
    const [invitation] = await compose({}, { regions: [BERLIN] }, { _verified: true })

    const link = invitation?.html.match(
      new RegExp(`${MANAGER_SIGNIN_PATH}\\?token=([\\w.%-]+)`),
    )?.[1]
    expect(link, 'no settings link in the body').toBeDefined()
    // A page link, and no invitation: the account has accepted already.
    expect(decodeJwt(decodeURIComponent(link!)).aud).toBe('manager-link')
    const result = await readLinkToken(decodeURIComponent(link!), SECRET)
    // The account page, opened on the tab holding Notification Preferences.
    expect(result.status === 'valid' && result.claims).toMatchObject({
      to: '/admin/account',
      tab: 'Contact',
      userId: 7,
    })
  })

  it('titles a queued send "new", and a resend of everything plainly', async () => {
    const payload = fakePayload({}, { regions: [BERLIN] }).payload
    const [queued] = await composeInvitations({
      config: managersLogin,
      doc: doc(),
      only: { managed: { regions: [BERLIN.id] } },
      payload,
    })
    const [resent] = await composeInvitations({ config: managersLogin, doc: doc(), payload })

    expect(queued?.html).toContain('Your new responsibility<')
    expect(resent?.html).toContain('Your responsibility<')
  })

  it('sends one email per project, each branded and addressed for its own', async () => {
    const invitations = await compose(
      { fr: ['web-translator'] },
      { events: [TUESDAY], pages: [{ id: 3, title: 'About' }] },
      // A current project matching neither half changes nothing.
      { currentProject: 'wemeditate-app' },
    )

    expect(invitations.map((invitation) => invitation.subject)).toEqual([
      "You've been invited to look after About",
      `You've been invited to look after ${TUESDAY.title}`,
    ])
    expect(invitations[0]?.from).toMatch(/^WeMeditate Web </)
    expect(invitations[1]?.from).toMatch(/^Sahaj Atlas </)
    expect(invitations[0]?.html).not.toContain(TUESDAY.title)
    expect(invitations[1]?.html).not.toContain('Web Translator')
  })

  it('composes nothing when there is nothing to name', async () => {
    expect(await compose({}, { events: [FINISHED] })).toEqual([])
  })
})

describe('INVITE_VALID_FOR', () => {
  it('is derived from the TTL, so the copy cannot outlive the token', () => {
    expect(INVITE_VALID_FOR).toBe('7 days')
  })
})
