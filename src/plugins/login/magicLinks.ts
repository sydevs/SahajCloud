import type { LoginCollectionConfig, LoginDocument, LoginMailArgs } from './types'
import type { CollectionSlug, Payload } from 'payload'

import { z } from 'zod'

import { composeInvitations } from './invite'
import { signInLinkUrl } from './links'
import { emailFrom, generateEmailHTML, generateEmailSubject } from './mail'
import { createSession } from './session'
import { SIGNIN_TOKEN_TTL_MS } from './token'

/**
 * Issuing a sign-in link: the work, with no wiring around it. Two callers —
 * `POST /api/<slug>/request-magic-link` and the sign-in page's Server Action —
 * so everything that bounds abuse lives here rather than in either: the
 * throttle, the eligibility refusal, and the discipline of reporting nothing. A
 * second implementation would drift, and the one that drifts is the only in-app
 * bound on per-account link volume.
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
 * Whether this collection has the `_verified` accepted flag — and so an
 * invitation to send, and a flag for a redeemed link to set.
 *
 * ⚠ **Not every auth collection has the column.** Payload adds it only for one
 * configuring `auth.verify` (`getAuthFields.js`), so a collection without it
 * would read `undefined`, look unaccepted forever, and never get a sign-in link
 * — and a redeem that wrote it would write a field that does not exist. Read
 * off the sanitized config rather than configured, because that is Payload's
 * own answer.
 */
export function hasAcceptedFlag(payload: Payload, slug: string): boolean {
  return Boolean(payload.collections[slug as CollectionSlug]?.config.auth?.verify)
}

/**
 * Mint, stamp and send, or do nothing. Never reports which.
 *
 * Which mail it sends depends on `_verified`: an account that has never
 * accepted gets its invitation again, everyone else gets a sign-in link.
 *
 * ⚠ **It tells no caller what happened**, and that silence is the point: a
 * caller that could distinguish "sent" from "unknown address", "ineligible" or
 * "throttled" would be an account-enumeration oracle, and both callers are
 * anonymous by necessity. It throws only on a transport failure, which every
 * caller swallows for the same reason.
 *
 * ⚠ **One exception, and it is not an oracle anywhere it can be reached.** A
 * `config.previewAutoSignIn` address is signed in here and the token returned,
 * so a Railway preview needs no second credential and no route of its own. The
 * option is unset in production, in CI and in local dev, so there the answer is
 * uniform for every address — see {@link LoginCollectionConfig.previewAutoSignIn}.
 */
export async function issueMagicLink({
  config,
  email,
  payload,
}: {
  config: LoginCollectionConfig
  email: string
  payload: Payload
}): Promise<undefined | { token: string }> {
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
    // `_verified` decides which of the two links this send is — see below.
    select: { _verified: true, email: true, magicLinkIssuedAt: true, name: true, ...config.select },
  })

  const account = docs[0] as LoginDocument | undefined
  // No address is nothing to send to. Unreachable through the query above, which
  // matched on `email` — but the field is nullable on a structural document, and
  // a silent `sendEmail(undefined)` is the wrong way to find that out.
  if (!account?.email) return

  // Read off the fetched document, not `req.user` — every caller is anonymous,
  // so there is none.
  if (config.isEligible && !config.isEligible(account)) return

  // Before the throttle on purpose: the smoke lane signs in many times in a
  // run, and a minute's wait between them would fail it rather than bound
  // anything — nothing is mailed and no link is minted on this path.
  if (config.previewAutoSignIn && account.email === config.previewAutoSignIn) {
    // The JWT strategy yields no user for an unaccepted account, so minting here
    // would answer with a token that authenticates nobody, one request later.
    if (hasAcceptedFlag(payload, slug) && account._verified !== true) return
    return { token: await createSession(payload, slug, account.id) }
  }

  const now = new Date()
  const outstanding = account.magicLinkIssuedAt
  if (outstanding && now.getTime() - new Date(outstanding).getTime() < REQUEST_LINK_THROTTLE_MS) {
    return
  }

  // Stamped before the send: the token's claim must match what is stored, and a
  // stamp written afterwards would leave a window where a delivered link
  // matches nothing. A failed send therefore costs the account one throttle
  // window, which is the safer way round.
  await stampIssuedAt(payload, slug, account.id, now)

  // ⚠ **An unaccepted account gets the invitation, not a sign-in link**, and
  // that branch is what rescues a manager nothing ever mailed — an imported row,
  // or one whose invitation was lost. Everything it holds is named, not just
  // what is new: nothing announced so far has got it in. None when there is
  // nothing to name — and then a sign-in link would be refused too. Say
  // nothing, as ever.
  if (hasAcceptedFlag(payload, slug) && account._verified !== true) {
    const invitations = await composeInvitations({ config, doc: account, now, payload })
    for (const invitation of invitations) await payload.sendEmail({ to: account.email, ...invitation })
    return
  }

  const args: LoginMailArgs = {
    doc: account,
    project: config.project?.(account) ?? undefined,
    signInUrl: await signInLinkUrl(config, account.id, payload.secret, now),
    validFor: SIGNIN_VALID_FOR,
  }

  // Inline, not queued: the throttle above bounds the volume this can
  // generate, and a queued send would let the caller's request return before
  // delivery could fail.
  await payload.sendEmail({
    to: account.email,
    from: emailFrom(args.project),
    subject: generateEmailSubject(args),
    html: await generateEmailHTML(args),
  })
}

/**
 * A sign-in link for one account, minted exactly as a delivered one is, with no
 * mail — the operator's break-glass (`scripts/signin-link.ts`).
 *
 * ⚠ **It stamps `magicLinkIssuedAt`, and must.** the redeem route spends a
 * link only while its `issuedAt` equals the stored stamp, so a token signed
 * without one is refused as invalid on the only click that matters. Stamping
 * replaces any outstanding link and restarts the throttle window, exactly as a
 * fresh request does.
 *
 * No eligibility or acceptance check: {@link issueMagicLink} answers anonymous
 * callers and must not say why it sent nothing, while the script's caller is an
 * operator who needs to be told — so the script checks, and says.
 */
export async function mintSignInLink({
  config,
  id,
  now = new Date(),
  payload,
}: {
  config: LoginCollectionConfig
  id: number | string
  now?: Date
  payload: Payload
}): Promise<string> {
  await stampIssuedAt(payload, config.slug, id, now)
  return signInLinkUrl(config, id, payload.secret, now)
}

/**
 * Record the instant a link is minted. The stamp is the link's nonce, its
 * throttle window, and what a fresh request overwrites — see `magicLinkIssuedAt`.
 */
async function stampIssuedAt(payload: Payload, slug: CollectionSlug, id: number | string, now: Date) {
  await payload.update({
    collection: slug,
    id,
    data: { magicLinkIssuedAt: now.toISOString() } as never,
    depth: 0,
    overrideAccess: true,
  })
}
