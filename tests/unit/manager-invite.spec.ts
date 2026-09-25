/**
 * The manager invitation: what it may claim, and what it mints (#839).
 *
 * Three separable things, all reachable without a Payload bootstrap:
 *
 * - `summarizeGrants` — the only access an invitation can honestly name, and
 *   the locale isolation that keeps composing it from corrupting the create it
 *   runs inside.
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
  INVITE_VALID_FOR,
  readInviteToken,
  readSigninToken,
  summarizeGrants,
} from '@/plugins/login'

const SECRET = 'invite-spec-secret'

/** The one collection the summary can describe. Spread into every call below. */
const managers = { collection: 'managers', id: 1 }

type FindArgs = { locale?: string; req?: { locale?: string }; select?: Record<string, true> }

/** A `payload` that answers the one `locale: 'all'` read the summary performs. */
function fakePayload(roles: unknown) {
  const reads: FindArgs[] = []

  const payload = {
    secret: SECRET,
    findByID: async (args: FindArgs) => {
      reads.push(args)
      // What `createLocalReq` does, and the whole reason `localeIsolatedReq`
      // exists: the locale is written onto the caller's own request object.
      if (args.req && args.locale) args.req.locale = args.locale
      return { roles }
    },
  } as unknown as Payload

  return { payload, reads }
}

describe('summarizeGrants', () => {
  it('names full access for an admin, and reads no roles at all', async () => {
    const { payload, reads } = fakePayload({ en: ['meditations-editor'] })

    const summary = await summarizeGrants({ ...managers, payload, type: 'admin' })

    expect(summary).toEqual({ fullAccess: true, grants: [] })
    expect(reads).toHaveLength(0)
  })

  it('renders role LABELS per locale, most roles first', async () => {
    const { payload } = fakePayload({
      en: ['meditations-editor'],
      fr: ['web-translator', 'path-editor'],
    })

    const summary = await summarizeGrants({ ...managers, payload, type: 'manager' })

    expect(summary).toEqual({
      fullAccess: false,
      grants: [
        { locale: 'French', roles: ['Web Translator', 'Path Editor'] },
        { locale: 'English', roles: ['Meditations Editor'] },
      ],
    })
  })

  it('reads roles and nothing else — no region, no page, no event', async () => {
    // ⚠ **This is where "the invitation names no region or page" is testable.**
    // The template can only render what it is handed, so asserting the absence
    // of those words in its output asserts the fixture. The property is that the
    // summary never reads them: `managedPages`, `managedRegions` and
    // `managedEvents` are joins, empty for a manager created one instant ago.
    const { payload, reads } = fakePayload({ en: ['path-editor'] })

    await summarizeGrants({ ...managers, payload, type: 'manager' })

    expect(reads).toHaveLength(1)
    expect(reads[0]?.select).toEqual({ roles: true })
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
    })

    expect(summary).toEqual({ fullAccess: false, grants: [] })
    expect(reads).toHaveLength(0)
  })

  it('grants nothing when the manager holds no role anywhere', async () => {
    const { payload } = fakePayload({})

    expect(await summarizeGrants({ ...managers, payload, type: 'manager' })).toEqual({
      fullAccess: false,
      grants: [],
    })
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

    const subject = await verify.generateEmailSubject({ user: { id: 7 } } as never)

    expect(subject).toContain('invited')
    expect(subject.toLowerCase()).not.toContain('verify')
  })
})

describe('INVITE_VALID_FOR', () => {
  it('is derived from the TTL, so the copy cannot outlive the token', () => {
    expect(INVITE_VALID_FOR).toBe('7 days')
  })
})
