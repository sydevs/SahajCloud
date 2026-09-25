import type { LoginCollectionConfig, LoginDocument, LoginMailArgs } from './types'
import type { Payload } from 'payload'

import { z } from 'zod'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { emailFrom, generateEmailHTML, generateEmailSubject } from './mail'
import { signSigninToken, SIGNIN_TOKEN_TTL_MS } from './token'

/**
 * Issuing a sign-in link: the work, with no wiring around it.
 *
 * ⚠ **Its own module because it has two callers**, the same reason
 * `session.ts` is one. `POST /api/<slug>/request-magic-link` is one; the
 * manager sign-in page's Server Action is the other (#838). The endpoint that
 * used to hold this body is now only wiring, so the rule that the barrel
 * exports no endpoint factory stands unqualified.
 *
 * Everything that bounds abuse lives here rather than in either caller: the
 * throttle, the eligibility refusal, and the discipline of reporting nothing.
 * A second implementation would drift, and the one that drifts is the only
 * in-app bound on per-account link volume.
 */

/**
 * How long an account must wait between sign-in link requests.
 *
 * ⚠ **This is the only in-app bound on per-account link volume.** `rateLimitHook`
 * is a deliberate no-op for every collection — rate limiting is enforced at the
 * Cloudflare edge instead (`src/plugins/usage/hooks.ts`), and the edge keys on
 * IP, which cannot see the email in the request body.
 */
export const REQUEST_LINK_THROTTLE_MS = 60 * 1000

/**
 * How long a delivered link lasts, as the recipient is told.
 *
 * Derived, and shared by the mail and the page that asks for it, so changing
 * the TTL cannot leave either one saying otherwise.
 */
export const SIGNIN_VALID_FOR = `${SIGNIN_TOKEN_TTL_MS / 60_000} minutes`

/**
 * The one spelling of a submitted address.
 *
 * ⚠ Both callers parse with this. Normalisation living in one of them would let
 * the other miss a match, and the uniform answer below would hide the miss.
 */
export const magicLinkEmailSchema = z.object({
  // Normalised to match what is stored: Payload's own `email` base field
  // lowercases and trims on every write, so a bare equality against the typed
  // address misses `John.Smith@…`.
  email: z.string().trim().email().toLowerCase(),
})

/**
 * Mint, stamp and send, or do nothing. Never reports which.
 *
 * ⚠ **It tells no caller what happened**, and that silence is the point: a
 * caller that could distinguish "sent" from "unknown address", "ineligible" or
 * "throttled" would be an account-enumeration oracle, and both callers are
 * anonymous by necessity. It throws only on a transport failure, which every
 * caller swallows for the same reason.
 */
export async function issueMagicLink({
  config,
  email,
  payload,
}: {
  config: LoginCollectionConfig
  email: string
  payload: Payload
}): Promise<void> {
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

  // Read off the fetched document, not `req.user` — every caller is anonymous,
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
    // ⚠ The link addresses the sign-in page, not the endpoint. A `GET` is then
    // answered by a real page that reads the token and writes nothing, and the
    // burn stays behind that page's form — see `redeemMagicLink`.
    signInUrl: `${getServerUrl()}${config.requestPagePath}?token=${encodeURIComponent(token)}`,
    validFor: SIGNIN_VALID_FOR,
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
