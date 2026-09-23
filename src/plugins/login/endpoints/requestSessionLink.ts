import type { LoginCollectionConfig, LoginDocument, LoginMailArgs } from '../types'
import type { Endpoint, PayloadRequest } from 'payload'

import { z } from 'zod'

import { parseBody } from '@/lib/endpoints'
import { getServerUrl } from '@/lib/utilities/serverUrl'

import { emailFrom, generateEmailHTML, generateEmailSubject } from '../mail'
import { signSigninToken, SIGNIN_TOKEN_TTL_MS } from '../token'
import { CONSUME_LINK_PATH } from './consumeSessionLink'

export const REQUEST_LINK_PATH = '/request-link'

/**
 * How long an account must wait between sign-in link requests.
 *
 * ⚠ **This is the only in-app bound on per-account link volume.** `rateLimitHook`
 * is a deliberate no-op for every collection — rate limiting is enforced at the
 * Cloudflare edge instead (`src/plugins/usage/hooks.ts`), and the edge keys on
 * IP, which cannot see the email in the request body.
 */
export const REQUEST_LINK_THROTTLE_MS = 60 * 1000

const bodySchema = z.object({
  // Normalised to match what is stored: Payload's own `email` base field
  // lowercases and trims on every write, so a bare equality against the typed
  // address misses `John.Smith@…` — and the uniform answer below hides the miss.
  email: z.string().trim().email().toLowerCase(),
})

/** What every caller sees, whatever happened. See the handler's docblock. */
const ACCEPTED = { ok: true } as const

/**
 * `POST /api/<slug>/request-link`
 *
 * Trades an email address for an emailed sign-in link, for one configured auth
 * collection. `loginPlugin` builds one of these per entry in its `collections`
 * option.
 *
 * Auth: **intentionally anonymous** — an account that cannot sign in is exactly
 * who asks for a link, so no guard is possible here. It is absent from the
 * OpenAPI client spec for the same reason `set-project` is: the collections this
 * serves are admin-only and in no project, so they publish no public paths.
 *
 * ⚠ **The response is identical for every outcome** — a link sent, an address
 * nobody holds, a document `isEligible` rejects, and a repeat inside the
 * throttle window. Any difference is an account-enumeration oracle on an
 * anonymous endpoint, and the throttle is the sharpest one: a 429 would tell the
 * caller the address is real *and* recently used. The work still differs (an
 * unknown address neither writes nor sends), so this is uniform in status and
 * body rather than in elapsed time; closing the timing channel would mean paying
 * for a send that is not happening.
 */
export function requestSessionLink(config: LoginCollectionConfig): Endpoint {
  return {
    path: REQUEST_LINK_PATH,
    method: 'post',
    handler: async (req) => {
      const parsed = await parseBody(req, bodySchema)
      if (!parsed.ok) return parsed.response

      try {
        await issueLink(req, config, parsed.data.email)
      } catch (error) {
        // Never surfaced: a transport failure that reached the caller would be an
        // oracle too, since only a real address gets as far as a send.
        req.payload.logger.error({
          msg: 'requestSessionLink: could not issue a sign-in link',
          collection: config.slug,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      return Response.json(ACCEPTED)
    },
  }
}

/** Mint, stamp and send, or do nothing. Never reports which. */
async function issueLink(
  req: PayloadRequest,
  config: LoginCollectionConfig,
  email: string,
): Promise<void> {
  const { payload } = req
  const { slug } = config

  // Bounded: this is the one unauthenticated read in the feature, and the
  // fields below are everything it consumes. `config.select` is what lets
  // `isEligible` read a field of its own without widening this for everyone.
  const { docs } = await payload.find({
    collection: slug,
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    // `as never`: `joins` narrows per collection, so over the whole slug union
    // it collapses to `undefined`. Same cast, same reason, as `createSession`.
    joins: false as never,
    overrideAccess: true,
    select: { email: true, magicLinkIssuedAt: true, name: true, ...config.select },
  })

  const account = docs[0] as LoginDocument | undefined
  // No address is nothing to send to. Unreachable through the query above, which
  // matched on `email` — but the field is nullable on a structural document, and
  // a silent `sendEmail(undefined)` is the wrong way to find that out.
  if (!account?.email) return

  // Read off the fetched document, not `req.user` — this endpoint is anonymous,
  // so there is none.
  if (config.isEligible && !config.isEligible(account)) return

  const now = new Date()
  const outstanding = account.magicLinkIssuedAt
  if (outstanding && now.getTime() - new Date(outstanding).getTime() < REQUEST_LINK_THROTTLE_MS) {
    return
  }

  // Stamped before the send: the token's claim must match what is stored, and a
  // stamp written afterwards would leave a window where a delivered link
  // matches nothing. A failed send therefore costs the account one throttle
  // window, which is the safer way round.
  await payload.update({
    collection: slug,
    id: account.id,
    data: { magicLinkIssuedAt: now.toISOString() } as never,
    depth: 0,
    overrideAccess: true,
  })

  const token = await signSigninToken(
    { collection: slug, issuedAt: now.getTime(), userId: account.id },
    payload.secret,
    now,
  )

  const args: LoginMailArgs = {
    doc: account,
    project: config.project?.(account) ?? undefined,
    signInUrl: `${getServerUrl()}/api/${slug}${CONSUME_LINK_PATH}?token=${encodeURIComponent(token)}`,
    // Derived, so changing the TTL cannot leave the email saying otherwise.
    validFor: `${SIGNIN_TOKEN_TTL_MS / 60_000} minutes`,
  }

  await payload.sendEmail({
    to: account.email,
    from: emailFrom(args),
    subject: (config.generateEmailSubject ?? generateEmailSubject)(args),
    // Inline, not queued, matching the verify and reset mail `Managers.auth`
    // already builds with `renderEmail`. The throttle above bounds the volume
    // this can generate, and a queued send would let the caller's request
    // return before delivery could fail.
    html: await (config.generateEmailHTML ?? generateEmailHTML)(args),
  })
}
