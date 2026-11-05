/**
 * The provider adapters, against a stubbed `fetch`.
 *
 * What is worth pinning here is the **mapping**, not the request shape: each
 * provider says "this address opted out" in its own words, and getting that
 * wrong means re-adding an address that unsubscribed — the single fastest way
 * to get a sender blocklisted. Everything else follows from the union.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAILING_LIST_ADAPTERS, adapterFor } from '@/lib/mailingList/providers'
import { datacenterOf } from '@/lib/mailingList/providers/mailchimp'
import { isMailingListConfigured, subscribeToMailingList } from '@/lib/mailingList/subscribe'
import type { MailingListConfig } from '@/lib/mailingList/types'
import { MAILING_LIST_PROVIDERS } from '@/lib/mailingList/types'

const MAILCHIMP: MailingListConfig = {
  enabled: true,
  provider: 'mailchimp',
  listId: 'list-1',
  apiKey: 'key-us14',
  doubleOptIn: true,
}

const BREVO: MailingListConfig = {
  enabled: true,
  provider: 'brevo',
  listId: '7',
  apiKey: 'brevo-key',
}

const KLAVIYO: MailingListConfig = {
  enabled: true,
  provider: 'klaviyo',
  listId: 'ABC123',
  apiKey: 'pk_klaviyo',
}

const CLEVERREACH: MailingListConfig = {
  enabled: true,
  provider: 'cleverreach',
  listId: '1337',
  apiKey: 'cr-secret',
  clientId: 'cr-id',
  doubleOptIn: true,
  doiFlowId: 'flow-9',
}

/** A stubbed provider answer. `body` is what the adapter's error reader parses. */
const answer = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

/**
 * CleverReach is the one provider that takes several calls — a token, then a
 * receiver read, then the upsert, then the confirmation flow — so each case
 * names only the answers it changes and the order stays an assertion about
 * which calls were made rather than about which mock came next.
 *
 * The receiver rule sits above the group rule, and `/send` above the flow
 * rule, because each longer path contains the shorter one.
 */
const cleverreachAnswers =
  (stub: Partial<Record<'token' | 'receiver' | 'upsert' | 'send' | 'flow' | 'group', Response>>) =>
  (url: unknown) => {
    const target = String(url)
    if (target.includes('/oauth/token.php')) return stub.token ?? answer(200, { access_token: 'tok' })
    if (target.includes('/receivers/upsert')) return stub.upsert ?? answer(200)
    if (target.includes('/receivers/')) return stub.receiver ?? answer(404)
    if (target.endsWith('/send')) return stub.send ?? answer(200)
    if (target.includes('/flow/flow/')) return stub.flow ?? answer(200)
    if (target.includes('/groups.json/')) return stub.group ?? answer(200)
    throw new Error(`unstubbed CleverReach call: ${target}`)
  }

/** Every CleverReach request body this adapter sent, by URL fragment. */
const bodyFor = (fetchMock: ReturnType<typeof vi.fn>, fragment: string) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes(fragment))
  return call ? JSON.parse(String((call[1] as RequestInit).body)) : undefined
}

const called = (fetchMock: ReturnType<typeof vi.fn>, fragment: string) =>
  fetchMock.mock.calls.some(([url]) => String(url).includes(fragment))

const subscribe = (config: MailingListConfig) =>
  subscribeToMailingList({ config, email: 'person@example.test', name: 'Ada' })

describe('isMailingListConfigured', () => {
  it('needs the switch and all three credentials', () => {
    expect(isMailingListConfigured(MAILCHIMP)).toBe(true)
    expect(isMailingListConfigured({ ...MAILCHIMP, enabled: false })).toBe(false)
    expect(isMailingListConfigured({ ...MAILCHIMP, apiKey: '' })).toBe(false)
    expect(isMailingListConfigured({ ...MAILCHIMP, listId: null })).toBe(false)
    expect(isMailingListConfigured(null)).toBe(false)
  })
})

describe('the adapter registry', () => {
  /**
   * The extensibility contract: a provider the select offers with no adapter is
   * a row nothing can deliver, and an adapter for one it no longer offers is
   * dead code. Adding a provider means one adapter object and one entry here.
   */
  it('has exactly one adapter per provider the select offers', () => {
    expect(Object.keys(MAILING_LIST_ADAPTERS).sort()).toEqual([...MAILING_LIST_PROVIDERS].sort())
  })

  it('answers nothing for a provider this build does not speak', () => {
    expect(adapterFor('sendgrid')).toBeNull()
    expect(adapterFor(null)).toBeNull()
    // Not a prototype lookup: `toString` is on every object, and none of them
    // can subscribe an address.
    expect(adapterFor('toString')).toBeNull()
  })
})

describe('datacenterOf', () => {
  it('reads the datacenter off the key', () => {
    expect(datacenterOf('abc123-us14')).toBe('us14')
    expect(datacenterOf('abc123-US14')).toBe('us14')
  })

  it('refuses a key with no suffix, rather than guessing one', () => {
    expect(datacenterOf('abc123')).toBeNull()
    expect(datacenterOf('abc123-notadc')).toBeNull()
  })
})

describe('subscribeToMailingList', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls no provider at all when the list is off', async () => {
    const result = await subscribe({ ...MAILCHIMP, enabled: false })
    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: 'not_configured', retryable: false }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  /**
   * A row can carry a provider this build has no adapter for — one written
   * before the group existed, or by an `overrideAccess` writer. That is a
   * configuration fact the delivery job records, not a crash.
   */
  it('records an unknown provider as terminal, rather than throwing', async () => {
    // Cast through `unknown`: the union refuses this value, which is the point
    // — only a row written outside the select can carry it.
    const result = await subscribe({
      ...MAILCHIMP,
      provider: 'sendgrid',
    } as unknown as MailingListConfig)
    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: 'not_configured', retryable: false }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  describe('Mailchimp', () => {
    it('reports `pending` with double opt-in on, and `subscribed` with it off', async () => {
      fetchMock.mockResolvedValue(answer(200))
      await expect(subscribe(MAILCHIMP)).resolves.toEqual({ ok: true, status: 'pending' })
      await expect(subscribe({ ...MAILCHIMP, doubleOptIn: false })).resolves.toEqual({
        ok: true,
        status: 'subscribed',
      })
    })

    it('asks for the status it just reported', async () => {
      fetchMock.mockResolvedValue(answer(200))
      await subscribe(MAILCHIMP)
      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
      expect(body.status).toBe('pending')
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('us14.api.mailchimp.com')
    })

    /**
     * ⚠ The one mapping that must not be wrong in the permissive direction.
     * Re-adding an address in a compliance state is what gets a sender
     * blocklisted, so it is terminal and never retried.
     */
    it('refuses to resurrect an address that opted out', async () => {
      fetchMock.mockResolvedValue(
        answer(400, { title: 'Member In Compliance State', detail: 'cannot be re-added' }),
      )
      await expect(subscribe(MAILCHIMP)).resolves.toEqual(
        expect.objectContaining({ ok: false, code: 'previously_unsubscribed', retryable: false }),
      )
    })

    it('treats an existing member as success, without reporting membership', async () => {
      fetchMock.mockResolvedValue(
        answer(400, { title: 'Member Exists', detail: 'is already a list member' }),
      )
      await expect(subscribe(MAILCHIMP)).resolves.toEqual({ ok: true, status: 'subscribed' })
    })

    it('retries a 5xx and not a 4xx', async () => {
      fetchMock.mockResolvedValue(answer(503, { title: 'Bad Gateway' }))
      await expect(subscribe(MAILCHIMP)).resolves.toEqual(
        expect.objectContaining({ code: 'provider_unavailable', retryable: true }),
      )

      fetchMock.mockResolvedValue(answer(401, { title: 'API Key Invalid' }))
      await expect(subscribe(MAILCHIMP)).resolves.toEqual(
        expect.objectContaining({ code: 'provider_rejected', retryable: false }),
      )
    })

    it('refuses a key with no datacenter before it calls anything', async () => {
      await expect(subscribe({ ...MAILCHIMP, apiKey: 'nosuffix' })).resolves.toEqual(
        expect.objectContaining({ code: 'provider_rejected', retryable: false }),
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('reports a transport failure as retryable', async () => {
      fetchMock.mockRejectedValue(new Error('socket hang up'))
      await expect(subscribe(MAILCHIMP)).resolves.toEqual(
        expect.objectContaining({ code: 'provider_unavailable', retryable: true }),
      )
    })
  })

  describe('Brevo', () => {
    /** Single opt-in only, which is why `doubleOptIn` is not rendered for it. */
    it('always reports `subscribed`, never `pending`', async () => {
      fetchMock.mockResolvedValue(answer(201))
      await expect(subscribe(BREVO)).resolves.toEqual({ ok: true, status: 'subscribed' })
      await expect(subscribe({ ...BREVO, doubleOptIn: true })).resolves.toEqual({
        ok: true,
        status: 'subscribed',
      })
    })

    it('recognises a blocklisted contact under Brevo’s own name for it', async () => {
      fetchMock.mockResolvedValue(
        answer(400, { code: 'invalid_parameter', message: 'Contact is in a blocklist' }),
      )
      await expect(subscribe(BREVO)).resolves.toEqual(
        expect.objectContaining({ code: 'previously_unsubscribed', retryable: false }),
      )
    })

    it('refuses a non-numeric list id before it calls anything', async () => {
      await expect(subscribe({ ...BREVO, listId: 'not-a-number' })).resolves.toEqual(
        expect.objectContaining({ code: 'provider_rejected', retryable: false }),
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('Klaviyo', () => {
    /**
     * Its subscribe job answers 202 with no per-profile result, so the adapter
     * cannot tell "newly subscribed" from "already there" from "opted out".
     * `accepted` names that gap instead of faking a `subscribed`.
     */
    it('always reports `accepted`', async () => {
      fetchMock.mockResolvedValue(answer(202))
      await expect(subscribe(KLAVIYO)).resolves.toEqual({ ok: true, status: 'accepted' })
    })

    it('can never report previously_unsubscribed', async () => {
      for (const status of [400, 401, 409, 422, 500]) {
        fetchMock.mockResolvedValue(answer(status, { errors: [{ title: 'Nope' }] }))
        const result = await subscribe(KLAVIYO)
        expect(result.ok ? 'ok' : result.code).not.toBe('previously_unsubscribed')
      }
    })

    /**
     * ⚠ Nothing may bypass suppression. An address Klaviyo has suppressed must
     * stay suppressed, even though this adapter cannot see that it was — so no
     * `historical_import`-style flag may appear in the request.
     */
    it('sends a plain subscribe job, with nothing that skips suppression', async () => {
      fetchMock.mockResolvedValue(answer(202))
      await subscribe(KLAVIYO)
      const raw = String(fetchMock.mock.calls[0]?.[1]?.body)
      expect(raw).not.toContain('historical_import')
      expect(JSON.parse(raw).data.type).toBe('profile-subscription-bulk-create-job')
    })
  })

  describe('CleverReach', () => {
    /**
     * The only adapter with two credentials and its own confirmation mail, so
     * what is pinned here is the opt-in ladder: inactive plus a flow send for
     * `pending`, active in one write for `subscribed`.
     */
    it('reports `pending` with double opt-in on, and `subscribed` with it off', async () => {
      fetchMock.mockImplementation(cleverreachAnswers({}))
      await expect(subscribe(CLEVERREACH)).resolves.toEqual({ ok: true, status: 'pending' })
      expect(bodyFor(fetchMock, '/receivers/upsert').activated).toBe(0)
      expect(bodyFor(fetchMock, '/flow/flow/').receiver_id).toBe('person@example.test')

      fetchMock.mockClear()
      await expect(subscribe({ ...CLEVERREACH, doubleOptIn: false })).resolves.toEqual({
        ok: true,
        status: 'subscribed',
      })
      expect(bodyFor(fetchMock, '/receivers/upsert').activated).toBeGreaterThan(0)
      expect(called(fetchMock, '/flow/flow/')).toBe(false)
    })

    it('sends the opt-in record the submission row happened to carry', async () => {
      fetchMock.mockImplementation(cleverreachAnswers({}))
      await subscribeToMailingList({
        config: CLEVERREACH,
        email: 'person@example.test',
        userAgent: 'Mozilla/5.0',
        hostUrl: 'https://host.example/classes',
      })
      // No `user_ip`: no submission row stores one, and none is invented.
      expect(bodyFor(fetchMock, '/flow/flow/').doidata).toEqual({
        referer: 'https://host.example/classes',
        user_agent: 'Mozilla/5.0',
      })
    })

    it('sends no confirmation to an address already active on the group', async () => {
      fetchMock.mockImplementation(cleverreachAnswers({ receiver: answer(200, { active: 1 }) }))
      await expect(subscribe(CLEVERREACH)).resolves.toEqual({ ok: true, status: 'subscribed' })
      expect(called(fetchMock, '/receivers/upsert')).toBe(false)
      expect(called(fetchMock, '/flow/flow/')).toBe(false)
    })

    /**
     * ⚠ The mapping that must not be wrong in the permissive direction. The
     * upsert carries `activated`, so writing one over a receiver that opted
     * out is what resurrects them — hence the read, and hence no write here.
     */
    it('refuses to resurrect a deactivated receiver, and writes nothing', async () => {
      fetchMock.mockImplementation(
        cleverreachAnswers({ receiver: answer(200, { deactivated: 1700000000 }) }),
      )
      await expect(subscribe(CLEVERREACH)).resolves.toEqual(
        expect.objectContaining({ ok: false, code: 'previously_unsubscribed', retryable: false }),
      )
      expect(called(fetchMock, '/receivers/upsert')).toBe(false)
    })

    it('reads a blocklist refusal on the upsert as the same terminal case', async () => {
      fetchMock.mockImplementation(
        cleverreachAnswers({
          upsert: answer(400, { error: { message: 'receiver is on the blacklist' } }),
        }),
      )
      await expect(subscribe(CLEVERREACH)).resolves.toEqual(
        expect.objectContaining({ code: 'previously_unsubscribed', retryable: false }),
      )
    })

    it('refuses a config with no client ID, or no flow ID, before calling anything', async () => {
      // `isMailingListConfigured` stays provider-blind, so these are the
      // adapter's own refusals rather than the caller's.
      await expect(subscribe({ ...CLEVERREACH, clientId: null })).resolves.toEqual(
        expect.objectContaining({ code: 'provider_rejected', retryable: false }),
      )
      await expect(subscribe({ ...CLEVERREACH, doiFlowId: '' })).resolves.toEqual(
        expect.objectContaining({ code: 'provider_rejected', retryable: false }),
      )
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('retries a token 503 and not a token 401', async () => {
      fetchMock.mockImplementation(
        cleverreachAnswers({ token: answer(503, { error: 'server_error' }) }),
      )
      await expect(subscribe(CLEVERREACH)).resolves.toEqual(
        expect.objectContaining({ code: 'provider_unavailable', retryable: true }),
      )

      fetchMock.mockImplementation(
        cleverreachAnswers({
          token: answer(401, { error: 'invalid_client', error_description: 'bad secret' }),
        }),
      )
      await expect(subscribe(CLEVERREACH)).resolves.toEqual(
        expect.objectContaining({ code: 'provider_rejected', retryable: false, message: 'invalid_client: bad secret' }),
      )
    })
  })
})

/**
 * The save-time credential check, which `validateMailingList` now reaches
 * through the same registry.
 */
describe('verifyCredentials', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const verify = (config: MailingListConfig) =>
    MAILING_LIST_ADAPTERS[config.provider!].verifyCredentials(config, AbortSignal.timeout(1000))

  /**
   * ⚠ Every probe is a **read** of the named list. Validating by adding an
   * address would put a real contact on a real list every time an operator
   * edited a key, so no adapter may verify with a write.
   */
  it('reads the list back, and never writes', async () => {
    for (const config of [MAILCHIMP, BREVO, KLAVIYO]) {
      fetchMock.mockClear()
      fetchMock.mockResolvedValue(answer(200))
      await expect(verify(config)).resolves.toBeNull()

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
      expect(init?.method).toBeUndefined()
      expect(init?.body).toBeUndefined()
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('lists')
    }
  })

  it('tells a refused key apart from a missing list', async () => {
    fetchMock.mockResolvedValue(answer(401))
    await expect(verify(BREVO)).resolves.toBe('that API key was refused.')

    fetchMock.mockResolvedValue(answer(404))
    await expect(verify(BREVO)).resolves.toBe('that list id does not exist on this account.')
  })

  /**
   * An operator cannot fix a provider outage, so a 5xx must not become a
   * refusal that blocks their save. The credential goes in unproven.
   */
  it('proves nothing from a 5xx, rather than refusing the save', async () => {
    fetchMock.mockResolvedValue(answer(503))
    await expect(verify(KLAVIYO)).resolves.toBeNull()
  })

  it('refuses what cannot form a request at all, before calling anything', async () => {
    await expect(verify({ ...MAILCHIMP, apiKey: 'nosuffix' })).resolves.toContain('datacenter')
    await expect(verify({ ...BREVO, listId: 'not-a-number' })).resolves.toContain(
      'must be a number',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  /**
   * CleverReach's token exchange is a POST, so "never writes" is about every
   * call after it: the group and the flow are both read back.
   */
  describe('CleverReach', () => {
    it('writes nothing but the token exchange', async () => {
      fetchMock.mockImplementation(cleverreachAnswers({}))
      await expect(verify(CLEVERREACH)).resolves.toBeNull()

      const [first, ...rest] = fetchMock.mock.calls
      expect((first?.[1] as RequestInit).method).toBe('POST')
      expect(String(first?.[0])).toContain('/oauth/token.php')
      for (const [url, init] of rest) {
        expect((init as RequestInit | undefined)?.method).toBeUndefined()
        expect((init as RequestInit | undefined)?.body).toBeUndefined()
        expect(String(url)).toMatch(/\/groups\.json\/|\/flow\/flow\//)
      }
    })

    it('names the credential, the group and the flow apart', async () => {
      fetchMock.mockImplementation(cleverreachAnswers({ token: answer(401) }))
      await expect(verify(CLEVERREACH)).resolves.toBe('that client ID or secret was refused.')

      fetchMock.mockImplementation(cleverreachAnswers({ group: answer(404) }))
      await expect(verify(CLEVERREACH)).resolves.toBe(
        'that list id does not exist on this account.',
      )

      fetchMock.mockImplementation(cleverreachAnswers({ flow: answer(404) }))
      await expect(verify(CLEVERREACH)).resolves.toBe(
        'that confirmation flow ID does not exist on this account.',
      )
    })

    it('proves nothing from a token 5xx, rather than refusing the save', async () => {
      fetchMock.mockImplementation(cleverreachAnswers({ token: answer(503) }))
      await expect(verify(CLEVERREACH)).resolves.toBeNull()
    })

    it('reads no flow with double opt-in off', async () => {
      fetchMock.mockImplementation(cleverreachAnswers({}))
      await expect(verify({ ...CLEVERREACH, doubleOptIn: false })).resolves.toBeNull()
      expect(called(fetchMock, '/flow/flow/')).toBe(false)
    })
  })
})
