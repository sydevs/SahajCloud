/**
 * The manager invitation: what it may claim, how it is branded, and what it
 * mints (#839).
 *
 * Reachable without a Payload bootstrap:
 *
 * - `summarizeGrants` — the roles and managed documents an invitation names,
 *   narrowed to what was newly assigned when the queue sends it, and the locale
 *   isolation that keeps its roles read from repointing a caller's request.
 * - `brandProject` — the brand follows what the invitation lists.
 * - `composeInvitation` — the whole email: the button's target and the
 *   AUDIENCE of the token in it, asserted on the wire rather than the template.
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
import {
  brandProject,
  type GrantSummary,
  INVITE_VALID_FOR,
  readInviteToken,
  summarizeGrants,
} from '@/plugins/login'
import { composeInvitation } from '@/plugins/login/invite'

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
type Doc = { id: number; title: string; url?: string; verificationStage?: string }
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

describe('summarizeGrants', () => {
  it('renders role LABELS per locale, most roles first', async () => {
    const { payload } = fakePayload({
      en: ['meditations-editor'],
      fr: ['web-translator', 'path-editor'],
    })

    const summary = await summarizeGrants({ ...managers, payload, type: 'manager' })

    expect(summary.grants).toEqual([
      { locale: 'French', roles: ['Web Translator', 'Path Editor'] },
      { locale: 'English', roles: ['Meditations Editor'] },
    ])
    // Path Editor and Meditations Editor are both We Meditate App roles.
    expect(summary.relatedProjects).toEqual(['wemeditate-app', 'wemeditate-web'])
  })

  it('lists every document naming the manager, linked where it is public', async () => {
    const { payload, reads } = fakePayload(
      { en: ['atlas-manager'] },
      { regions: [BERLIN], events: [TUESDAY, DRAFT] },
    )

    const summary = await summarizeGrants({ ...managers, payload, type: 'manager' })

    expect(summary.responsibilities).toEqual([
      {
        label: 'Regions',
        singular: 'Region',
        items: [{ title: 'Berlin', url: BERLIN.url }],
      },
      {
        label: 'Events',
        singular: 'Event',
        items: [
          { title: TUESDAY.title, url: TUESDAY.url },
          { title: DRAFT.title, url: null },
        ],
      },
    ])
    expect(summary.relatedProjects).toEqual(['sahaj-atlas'])
    // Each join asks its own collection for the documents naming this manager.
    expect(reads.find((read) => read.collection === 'events')?.where?.and?.[0]).toEqual({
      manager: { in: [1] },
    })
    expect(reads.find((read) => read.collection === 'regions')?.where?.and?.[0]).toEqual({
      managers: { in: [1] },
    })
  })

  it('leaves out a finished event — there is nothing left to look after', async () => {
    const { payload } = fakePayload({}, { events: [TUESDAY, FINISHED] })

    const summary = await summarizeGrants({ ...managers, payload, type: 'manager' })

    expect(summary.responsibilities[0]?.items.map((item) => item.title)).toEqual([TUESDAY.title])
  })

  it('names only what was queued, and only while it is still held', async () => {
    const { payload } = fakePayload(
      { en: ['atlas-manager', 'web-translator'] },
      { regions: [BERLIN], events: [TUESDAY, DRAFT] },
    )

    const summary = await summarizeGrants({
      ...managers,
      payload,
      type: 'manager',
      only: {
        // `path-editor` was queued, then taken away before the send.
        roles: { en: ['atlas-manager', 'path-editor'] },
        managed: { events: [TUESDAY.id] },
      },
    })

    expect(summary.grants).toEqual([{ locale: 'English', roles: ['Atlas Manager'] }])
    expect(summary.responsibilities).toHaveLength(1)
    expect(summary.responsibilities[0]?.items).toEqual([{ title: TUESDAY.title, url: TUESDAY.url }])
  })

  it('names full access for an admin and reads no roles — but still lists what they manage', async () => {
    const { payload, reads } = fakePayload({ en: ['meditations-editor'] }, { regions: [BERLIN] })

    const summary = await summarizeGrants({ ...managers, payload, type: 'admin' })

    expect(summary.fullAccess).toBe(true)
    expect(summary.grants).toEqual([])
    expect(summary.responsibilities[0]?.items[0]?.title).toBe('Berlin')
    expect(reads.some((read) => read.select?.roles)).toBe(false)
  })

  it('ranks projects by how much of the listing is theirs', async () => {
    // One We Meditate Web role against two Atlas events: Atlas first.
    const { payload } = fakePayload({ fr: ['web-translator'] }, { events: [TUESDAY, DRAFT] })

    const summary = await summarizeGrants({ ...managers, payload, type: 'manager' })

    expect(summary.relatedProjects).toEqual(['sahaj-atlas', 'wemeditate-web'])
  })

  it('describes nothing for a collection whose roles it cannot read', async () => {
    // `hydrateLocalizedRoles` reads `managers` by id. For any other served
    // collection that would be a stranger's roles — so it must not read at all.
    const { payload, reads } = fakePayload({ en: ['path-editor'] })

    const summary = await summarizeGrants({
      collection: 'clients',
      id: 1,
      payload,
      type: 'manager',
    })

    expect(summary).toEqual({
      fullAccess: false,
      grants: [],
      responsibilities: [],
      relatedProjects: null,
    })
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

describe('brandProject', () => {
  const EMPTY: GrantSummary = {
    fullAccess: false,
    grants: [],
    responsibilities: [],
    relatedProjects: [],
  }
  const atlas: GrantSummary = { ...EMPTY, relatedProjects: ['sahaj-atlas'] }

  it('keeps the current project when the invitation lists something of it', () => {
    expect(
      brandProject('wemeditate-web', {
        ...EMPTY,
        relatedProjects: ['sahaj-atlas', 'wemeditate-web'],
      }),
    ).toBe('wemeditate-web')
  })

  it('replaces a current project the invitation lists nothing of', () => {
    // The case the rule exists for: a We Meditate brand on an Atlas-only invitation.
    expect(brandProject('wemeditate-web', atlas)).toBe('sahaj-atlas')
  })

  it('brands an account with no current project for what it lists', () => {
    // Every unaccepted account — none has signed in to choose one.
    expect(brandProject(undefined, atlas)).toBe('sahaj-atlas')
  })

  it('takes the default brand when the invitation lists nothing', () => {
    expect(brandProject('sahaj-atlas', EMPTY)).toBeUndefined()
  })

  it('keeps an admin’s own project when the listing names none', () => {
    expect(brandProject('sahaj-atlas', { ...EMPTY, fullAccess: true })).toBe('sahaj-atlas')
  })
})

describe('composeInvitation', () => {
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
    composeInvitation({
      config: managersLogin,
      doc: doc(overrides),
      payload: fakePayload(roles, managed).payload,
    })

  it('invites an unaccepted account through the sign-in page, never Payload’s verify route', async () => {
    const invitation = await compose({ en: ['atlas-manager'] }, { regions: [BERLIN] })

    const match = invitation?.html.match(
      new RegExp(`${getServerUrl()}${MANAGER_SIGNIN_PATH}\\?invite=([\\w.%-]+)`),
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

  it('points an accepted account at the admin, minting nothing', async () => {
    const invitation = await compose({}, { regions: [BERLIN] }, { _verified: true })

    expect(invitation?.html).toContain(`href="${getServerUrl()}/admin"`)
    expect(invitation?.html).not.toContain('?invite=')
  })

  it('subjects it with what to look after, and brands subject and sender alike', async () => {
    const invitation = await compose(
      {},
      { events: [TUESDAY] },
      { currentProject: 'wemeditate-web' },
    )

    expect(invitation?.subject).toBe(`You've been invited to look after ${TUESDAY.title}`)
    expect(invitation?.from).toMatch(/^Sahaj Atlas </)
    expect(invitation?.html).not.toContain('WeMeditate Web')
  })

  it('composes nothing when there is nothing to name', async () => {
    expect(await compose({}, { events: [FINISHED] })).toBeNull()
  })
})

describe('INVITE_VALID_FOR', () => {
  it('is derived from the TTL, so the copy cannot outlive the token', () => {
    expect(INVITE_VALID_FOR).toBe('7 days')
  })
})
