/**
 * The manager invitation: what it may claim, and what it mints (#839).
 *
 * Three separable things, all reachable without a Payload bootstrap:
 *
 * - `summarizeGrants` — the only access an invitation can honestly name, and
 *   the locale isolation that keeps composing it from corrupting the create it
 *   runs inside.
 * - `brandProject` — the brand follows what the invitation lists.
 * - `inviteVerification` — the `auth.verify` swap, asserted on the URL it
 *   builds and the AUDIENCE of the token in it, not on the template.
 * - `INVITE_VALID_FOR` — derived from the TTL, so the copy cannot outlive it.
 *
 * ⚠ The fake `payload` below emulates `createLocalReq`'s one load-bearing
 * behaviour: it assigns `locale` onto the request object it is handed. Without
 * that, the isolation test would pass against the defect it exists to catch.
 */
import type { Payload, PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { Managers } from '@/collections'
import { MANAGER_SIGNIN_PATH } from '@/collections/Managers/login'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import {
  brandProject,
  type GrantSummary,
  INVITE_VALID_FOR,
  LISTED_PER_KIND,
  readInviteToken,
  readSigninToken,
  summarizeGrants,
} from '@/plugins/login'

const SECRET = 'invite-spec-secret'

/** The one collection the summary can describe. Spread into every call below. */
const managers = { collection: 'managers', id: 1, withResponsibilities: false }

type FindArgs = {
  collection?: string
  locale?: string
  req?: { locale?: string }
  select?: Record<string, true>
  where?: Record<string, unknown>
}

/** Documents naming the manager, per collection: titles, and how many exist. */
type Managed = Partial<Record<'events' | 'pages' | 'regions', { titles: string[]; total?: number }>>

/**
 * The three joins `Managers` declares, as the sanitized config carries them,
 * and the target collections' own config the summary reads titles and labels
 * from. Regions nest, so they carry the self-referential `parent` field.
 */
const COLLECTIONS = {
  managers: {
    config: {
      flattenedFields: [
        { name: 'roles', type: 'select' },
        { name: 'managedPages', type: 'join', collection: 'pages', on: 'managers' },
        { name: 'managedRegions', type: 'join', collection: 'regions', on: 'managers' },
        { name: 'managedEvents', type: 'join', collection: 'events', on: 'manager' },
      ],
    },
  },
  pages: {
    config: {
      admin: { useAsTitle: 'title' },
      labels: { plural: 'Pages' },
      flattenedFields: [{ name: 'managers', type: 'relationship', relationTo: 'managers', hasMany: true }],
    },
  },
  regions: {
    config: {
      admin: { useAsTitle: 'name' },
      labels: { plural: 'Regions' },
      flattenedFields: [
        { name: 'managers', type: 'relationship', relationTo: 'managers', hasMany: true },
        { name: 'parent', type: 'relationship', relationTo: 'regions' },
      ],
    },
  },
  events: {
    config: {
      admin: { useAsTitle: 'title' },
      labels: { plural: 'Events' },
      flattenedFields: [{ name: 'manager', type: 'relationship', relationTo: 'managers' }],
    },
  },
}

/** A `payload` that answers the roles read, and a `find` per managed collection. */
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
    find: async (args: FindArgs & { limit: number }) => {
      reads.push(args)
      const { titles = [], total = titles.length } = managed[args.collection as keyof Managed] ?? {}
      const field = Object.keys(args.select ?? {})[0]!
      return {
        docs: titles.slice(0, args.limit).map((title) => ({ [field]: title })),
        totalDocs: total,
      }
    },
  } as unknown as Payload

  return { payload, reads }
}

/** A manager's summary with nothing listed. Spread and override per case. */
const EMPTY: GrantSummary = {
  fullAccess: false,
  grants: [],
  responsibilities: [],
  relatedProjects: [],
}

describe('summarizeGrants', () => {
  it('names full access for an admin, and reads no roles at all', async () => {
    const { payload, reads } = fakePayload({ en: ['meditations-editor'] })

    const summary = await summarizeGrants({ ...managers, payload, type: 'admin' })

    expect(summary).toEqual({ ...EMPTY, fullAccess: true, relatedProjects: null })
    expect(reads).toHaveLength(0)
  })

  it('renders role LABELS per locale, most roles first', async () => {
    const { payload } = fakePayload({
      en: ['meditations-editor'],
      fr: ['web-translator', 'path-editor'],
    })

    const summary = await summarizeGrants({ ...managers, payload, type: 'manager' })

    expect(summary).toEqual({
      ...EMPTY,
      grants: [
        { locale: 'French', roles: ['Web Translator', 'Path Editor'] },
        { locale: 'English', roles: ['Meditations Editor'] },
      ],
      // Path Editor and Meditations Editor are both We Meditate App roles.
      relatedProjects: ['wemeditate-app', 'wemeditate-web'],
    })
  })

  it('reads only roles for a create, whose joins cannot point at it yet', async () => {
    // `managedPages`, `managedRegions` and `managedEvents` are joins, empty for
    // a manager created one instant ago — so the create path reads none of
    // them inside its open transaction.
    const { payload, reads } = fakePayload({ en: ['path-editor'] })

    await summarizeGrants({ ...managers, payload, type: 'manager' })

    expect(reads).toHaveLength(1)
    expect(reads[0]?.select).toEqual({ roles: true })
  })

  it('lists the regions, events and pages naming the manager, on a resend', async () => {
    const { payload, reads } = fakePayload(
      { en: ['atlas-manager'] },
      {
        regions: { titles: ['Berlin'] },
        events: { titles: ['Tuesday Evening Meditation', 'Sunday Workshop'] },
      },
    )

    const summary = await summarizeGrants({
      ...managers,
      payload,
      type: 'manager',
      withResponsibilities: true,
    })

    expect(summary.responsibilities).toEqual([
      { label: 'Regions', titles: ['Berlin'], more: 0, nested: true },
      {
        label: 'Events',
        titles: ['Tuesday Evening Meditation', 'Sunday Workshop'],
        more: 0,
        nested: false,
      },
    ])
    expect(summary.relatedProjects).toEqual(['sahaj-atlas'])
    // Each join asks its own collection for the documents naming this manager.
    expect(reads.find((read) => read.collection === 'events')?.where).toEqual({
      manager: { in: [1] },
    })
    expect(reads.find((read) => read.collection === 'regions')?.where).toEqual({
      managers: { in: [1] },
    })
  })

  it('lists the first few titles and counts the rest', async () => {
    const { payload } = fakePayload(
      {},
      { events: { titles: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], total: 40 } },
    )

    const summary = await summarizeGrants({
      ...managers,
      payload,
      type: 'manager',
      withResponsibilities: true,
    })

    expect(summary.responsibilities[0]).toMatchObject({
      titles: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].slice(0, LISTED_PER_KIND),
      more: 40 - LISTED_PER_KIND,
    })
  })

  it('ranks projects by how much of the listing is theirs', async () => {
    // One We Meditate Web role against three Atlas events: Atlas first.
    const { payload } = fakePayload(
      { fr: ['web-translator'] },
      { events: { titles: ['A', 'B', 'C'] } },
    )

    const summary = await summarizeGrants({
      ...managers,
      payload,
      type: 'manager',
      withResponsibilities: true,
    })

    expect(summary.relatedProjects).toEqual(['sahaj-atlas', 'wemeditate-web'])
  })

  it('describes nothing for a collection whose roles it cannot read', async () => {
    // `hydrateLocalizedRoles` reads `managers` by id. For any other served
    // collection that is a stranger's roles, or a `NotFound` thrown inside an
    // open create — so it must not read at all.
    const { payload, reads } = fakePayload({ en: ['path-editor'] })

    const summary = await summarizeGrants({
      collection: 'clients',
      id: 1,
      payload,
      type: 'manager',
      withResponsibilities: true,
    })

    expect(summary).toEqual({ ...EMPTY, relatedProjects: null })
    expect(reads).toHaveLength(0)
  })

  it('grants nothing when the manager holds no role anywhere', async () => {
    const { payload } = fakePayload({})

    expect(await summarizeGrants({ ...managers, payload, type: 'manager' })).toEqual(EMPTY)
  })

  it('leaves the caller’s own locale alone', async () => {
    const { payload, reads } = fakePayload({ en: ['path-editor'] })
    const req = { locale: 'de' } as PayloadRequest

    await summarizeGrants({ ...managers, payload, req, type: 'manager' })

    // The read asked for every locale...
    expect(reads[0]?.locale).toBe('all')
    // ...on a COPY, so the create that called us still writes German (#609).
    expect(req.locale).toBe('de')
  })

  it('joins the caller’s transaction by passing a request through', async () => {
    const { payload, reads } = fakePayload({ en: ['path-editor'] })
    const req = { locale: 'de', transactionID: 'txn-1' } as unknown as PayloadRequest

    await summarizeGrants({ ...managers, payload, req, type: 'manager' })

    expect((reads[0]?.req as { transactionID?: string } | undefined)?.transactionID).toBe('txn-1')
  })
})

describe('brandProject', () => {
  const atlas: GrantSummary = { ...EMPTY, relatedProjects: ['sahaj-atlas'] }

  it('keeps the current project when the invitation lists something of it', () => {
    expect(
      brandProject('wemeditate-web', { ...EMPTY, relatedProjects: ['sahaj-atlas', 'wemeditate-web'] }),
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

  it('keeps the current project for an admin, who relates to every project', () => {
    expect(brandProject('sahaj-atlas', { ...EMPTY, fullAccess: true, relatedProjects: null })).toBe(
      'sahaj-atlas',
    )
  })
})

describe('Managers.auth.verify', () => {
  const verify = typeof Managers.auth === 'object' ? Managers.auth.verify : undefined

  /** The invitation as the manager receives it, token captured. */
  async function inviteToken(roles: unknown = { en: ['path-editor'] }) {
    if (typeof verify === 'boolean' || !verify?.generateEmailHTML) {
      throw new Error('Managers.auth.verify.generateEmailHTML is not configured')
    }

    const { payload } = fakePayload(roles)
    const html = await verify.generateEmailHTML({
      req: { payload } as unknown as PayloadRequest,
      // Payload's own verify token. The invitation ignores it.
      token: 'PAYLOAD-VERIFY-TOKEN',
      user: { id: 7, email: 'jo@example.com', name: 'Jo', type: 'manager' },
    } as never)

    const match = html.match(
      new RegExp(`${getServerUrl()}${MANAGER_SIGNIN_PATH}\\?invite=([\\w.%-]+)`),
    )
    expect(match, `no invitation link in the body:\n${html.slice(0, 400)}`).not.toBeNull()

    return { html, token: decodeURIComponent(match![1]!) }
  }

  it('addresses the sign-in page with `?invite=`, not Payload’s verify route', async () => {
    const { html } = await inviteToken()

    expect(html).toContain(`${getServerUrl()}${MANAGER_SIGNIN_PATH}?invite=`)
    // The route this swap replaces. It asks for a password this flow never sets.
    expect(html).not.toContain('/admin/managers/verify/')
    // And it does not carry the framework's token under any shape.
    expect(html).not.toContain('PAYLOAD-VERIFY-TOKEN')
  })

  it('mints an invitation token that the sign-in route refuses', async () => {
    const { token } = await inviteToken()

    expect((await readInviteToken(token, SECRET)).status).toBe('valid')
    // The separation IS the security property: a 7-day invitation must not be
    // spendable as a 15-minute sign-in link.
    expect((await readSigninToken(token, SECRET)).status).toBe('invalid')
  })

  it('claims the manager the create just made', async () => {
    const { token } = await inviteToken()
    const result = await readInviteToken(token, SECRET)

    expect(result.status === 'valid' && result.claims).toMatchObject({
      collection: 'managers',
      userId: 7,
    })
  })

  it('names the roles the manager holds, by label', async () => {
    const { html } = await inviteToken({ fr: ['web-translator'] })

    expect(html).toContain('French')
    expect(html).toContain('Web Translator')
  })

  it('subjects the invitation, never “verify your email”', async () => {
    if (typeof verify === 'boolean' || !verify?.generateEmailSubject) {
      throw new Error('Managers.auth.verify.generateEmailSubject is not configured')
    }

    const { payload } = fakePayload({ en: ['path-editor'] })
    const subject = await verify.generateEmailSubject({
      req: { payload } as unknown as PayloadRequest,
      user: { id: 7, type: 'manager' },
    } as never)

    expect(subject).toContain('invited')
    expect(subject.toLowerCase()).not.toContain('verify')
  })

  it('brands the subject and the body alike, from one read', async () => {
    if (typeof verify === 'boolean' || !verify?.generateEmailSubject || !verify.generateEmailHTML) {
      throw new Error('Managers.auth.verify is not configured')
    }

    // An Atlas role, and a current project it does not belong to.
    const { payload, reads } = fakePayload({ en: ['atlas-manager'] })
    const args = {
      req: { payload } as unknown as PayloadRequest,
      token: 'unused',
      user: { id: 7, email: 'jo@example.com', type: 'manager', currentProject: 'wemeditate-web' },
    } as never

    const html = await verify.generateEmailHTML(args)
    const subject = await verify.generateEmailSubject(args)

    expect(subject).toBe("You've been invited to Sahaj Atlas")
    expect(html).toContain('Sahaj Atlas')
    expect(html).not.toContain('WeMeditate Web')
    expect(reads).toHaveLength(1)
  })
})

describe('INVITE_VALID_FOR', () => {
  it('is derived from the TTL, so the copy cannot outlive the token', () => {
    expect(INVITE_VALID_FOR).toBe('7 days')
  })
})
