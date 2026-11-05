import type {
  MailingListAdapter,
  MailingListConfig,
  MailingListResult,
  SubscribeArgs,
} from '../types'

import { probeCredentials } from '../probe'
import { transportFailure } from '../types'

const CLEVERREACH_HOST = 'https://rest.cleverreach.com'

/** The failure arm alone, for the helpers below that can only refuse. */
type Failure = Extract<MailingListResult, { ok: false }>

/**
 * As much of CleverReach's receiver object as this adapter reads.
 *
 * Every flag is `unknown` because the same key arrives as a number, a numeric
 * string or a boolean depending on the endpoint, so each is read through
 * `flagged` rather than compared to a value.
 */
type Receiver = {
  active?: unknown
  activated?: unknown
  deactivated?: unknown
  blacklisted?: unknown
}

/**
 * Subscribe one address to a CleverReach group.
 *
 * The only adapter that needs **two** credentials: CleverReach issues a Bearer
 * token for a client id and secret, so `apiKey` holds the secret and
 * `clientId` the id of the OAuth app the operator created in their own
 * account. The token is minted per call on purpose — delivery volume is low,
 * and a module-level cache would not survive a Railway restart in any useful
 * way.
 *
 * Double opt-in is CleverReach's own: the receiver goes in inactive and the
 * confirmation mail is sent by a flow the operator names, which is why this
 * adapter can report `pending` where Brevo and Klaviyo cannot.
 */
async function subscribeCleverReach(args: SubscribeArgs): Promise<MailingListResult> {
  const { config, email, name, locale, source, userAgent, hostUrl, signal } = args
  const listId = config.listId ?? ''
  const clientId = config.clientId?.trim() ?? ''
  const doubleOptIn = config.doubleOptIn !== false
  const flowId = config.doiFlowId?.trim() ?? ''

  if (clientId === '') return refused('The CleverReach client ID is missing.')
  // Without it the address would go in inactive and never be asked to confirm,
  // which is a subscription nothing can complete.
  if (doubleOptIn && flowId === '') {
    return refused('The CleverReach confirmation flow ID is missing.')
  }

  try {
    const token = await accessToken(clientId, config.apiKey ?? '', signal)
    if (typeof token !== 'string') return token

    const groupPath = `/groups.json/${encodeURIComponent(listId)}`

    // ⚠ Read before writing. The upsert below carries `activated`, and writing
    // one over a receiver that opted out re-subscribes them — the single
    // fastest way to get a sender blocklisted.
    const existing = await authed(`${groupPath}/receivers/${encodeURIComponent(email)}`, {
      token,
      signal,
    })
    if (!existing.ok && existing.status !== 404) {
      return mapFailure(existing.status, await readError(existing))
    }

    if (existing.ok) {
      const receiver = (await existing.json().catch(() => null)) as Receiver | null
      if (flagged(receiver?.deactivated) || flagged(receiver?.blacklisted)) {
        return {
          ok: false,
          code: 'previously_unsubscribed',
          message: 'That address is deactivated or blocklisted on this CleverReach group.',
          retryable: false,
        }
      }
      // Already confirmed: idempotent for the caller, no second confirmation
      // mail, and it reports nothing about who else is on the list.
      if (flagged(receiver?.active) || flagged(receiver?.activated)) {
        return { ok: true, status: 'subscribed' }
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const upsert = await authed(`${groupPath}/receivers/upsert`, {
      token,
      signal,
      body: {
        email,
        registered: now,
        activated: doubleOptIn ? 0 : now,
        ...(source ? { source } : {}),
        global_attributes: {
          ...(name ? { firstname: name } : {}),
          // shortcut: an account whose attribute pool has no `language` refuses
          // this. Drop it if that turns up, or send the account's own key.
          ...(locale ? { language: locale } : {}),
        },
      },
    })

    if (!upsert.ok) {
      const detail = await readError(upsert)
      // The read above misses an address CleverReach holds account-wide rather
      // than on this group, so its own words are the second line of defence.
      if (/blacklist|blocklist|unsubscrib|deactivated/i.test(detail)) {
        return { ok: false, code: 'previously_unsubscribed', message: detail, retryable: false }
      }
      return mapFailure(upsert.status, detail)
    }

    if (!doubleOptIn) return { ok: true, status: 'subscribed' }

    const send = await authed(`/flow/flow/${encodeURIComponent(flowId)}/send`, {
      token,
      signal,
      body: {
        receiver_id: email,
        // CleverReach's own record of the opt-in. Both values are
        // client-reported rather than observed, and no row stores an IP, so
        // this is weaker proof than a form CleverReach hosted itself.
        doidata: {
          ...(hostUrl ? { referer: hostUrl } : {}),
          ...(userAgent ? { user_agent: userAgent } : {}),
        },
      },
    })
    if (!send.ok) return mapFailure(send.status, await readError(send))

    return { ok: true, status: 'pending' }
  } catch (error) {
    return transportFailure(error)
  }
}

/**
 * One Bearer-authenticated REST v3 call. A `body` makes it a POST.
 */
function authed(
  path: string,
  { token, signal, body }: { token: string; signal: AbortSignal; body?: unknown },
): Promise<Response> {
  return fetch(`${CLEVERREACH_HOST}/v3${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          body: JSON.stringify(body),
        }),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    signal,
  })
}

/**
 * Exchange the OAuth app's id and secret for a Bearer token, or say why not.
 *
 * Throws on a transport failure, so the caller's catch maps it the same way it
 * maps one from the API calls.
 */
async function accessToken(
  clientId: string,
  secret: string,
  signal: AbortSignal,
): Promise<string | Failure> {
  const response = await fetch(`${CLEVERREACH_HOST}/oauth/token.php`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
    signal,
  })

  if (!response.ok) return mapFailure(response.status, await readError(response))

  const body = (await response.json().catch(() => null)) as { access_token?: unknown } | null
  if (typeof body?.access_token !== 'string' || body.access_token === '') {
    return refused('CleverReach issued no access token for that client ID and secret.')
  }
  return body.access_token
}

/** 5xx and 429 are the provider having a bad moment; any other 4xx is us being wrong. */
function mapFailure(status: number, message: string): Failure {
  const retryable = status >= 500 || status === 429
  return {
    ok: false,
    code: retryable ? 'provider_unavailable' : 'provider_rejected',
    message,
    retryable,
  }
}

/** A refusal this adapter reaches on its own, before or instead of a call. */
function refused(message: string): Failure {
  return { ok: false, code: 'provider_rejected', message, retryable: false }
}

/** Whether one of `Receiver`'s three-shaped flags is set. */
function flagged(value: unknown): boolean {
  return typeof value === 'boolean' ? value : Number(value) > 0
}

/**
 * CleverReach's two error bodies as one sentence — REST v3 nests
 * `{ error: { message } }`, the OAuth endpoint answers
 * `{ error, error_description }`. Never throws; see the Mailchimp twin.
 */
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: unknown } | string
      error_description?: unknown
    }
    const parts =
      typeof body.error === 'string' ? [body.error, body.error_description] : [body.error?.message]
    const message = parts
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
      .join(': ')
    if (message !== '') return message
  } catch {
    // Fall through to the status line.
  }
  return `CleverReach answered ${response.status}.`
}

/**
 * Read the group back, and the confirmation flow too when one is in use. Both
 * are reads, as the interface requires.
 */
async function verifyCleverReach(
  config: MailingListConfig,
  signal: AbortSignal,
): Promise<string | null> {
  const clientId = config.clientId?.trim() ?? ''
  if (clientId === '') return 'the CleverReach client ID is missing.'

  const token = await accessToken(clientId, config.apiKey ?? '', signal)
  if (typeof token !== 'string') {
    // A provider having a bad moment proves nothing, and must not refuse the
    // save — the same answer `probeCredentials` gives a 5xx.
    return token.retryable ? null : 'that client ID or secret was refused.'
  }

  const group = await probeCredentials(
    `${CLEVERREACH_HOST}/v3/groups.json/${encodeURIComponent(config.listId ?? '')}`,
    { Authorization: `Bearer ${token}` },
    signal,
  )
  if (group !== null) return group
  if (config.doubleOptIn === false) return null

  const flowId = config.doiFlowId?.trim() ?? ''
  if (flowId === '') return 'the CleverReach confirmation flow ID is missing.'

  // Not `probeCredentials`: its 404 names a list id, which is the wrong noun
  // for a flow and would send the operator to the wrong field.
  const flow = await authed(`/flow/flow/${encodeURIComponent(flowId)}`, { token, signal })
  if (flow.status === 404) return 'that confirmation flow ID does not exist on this account.'
  if (!flow.ok && flow.status < 500) return await readError(flow)
  return null
}

export const cleverreachAdapter: MailingListAdapter = {
  subscribe: subscribeCleverReach,
  verifyCredentials: verifyCleverReach,
}
