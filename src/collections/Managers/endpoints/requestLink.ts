import type { Endpoint, PayloadRequest } from 'payload'

import { createElement } from 'react'
import { z } from 'zod'

import { SignInLinkEmail } from '@/emails/SignInLinkEmail'
import { parseBody } from '@/lib/endpoints'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { Manager } from '@/payload-types'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'
import { REQUEST_LINK_THROTTLE_MS } from '@/plugins/login/fields'
import { signSigninToken, SIGNIN_TOKEN_TTL_MS } from '@/plugins/login/token'

import { CONSUME_LINK_PATH } from './consumeLink'

export const REQUEST_LINK_PATH = '/request-link'

const bodySchema = z.object({
  email: z.string().email(),
})

/** What every caller sees, whatever happened. See the handler's docblock. */
const ACCEPTED = { ok: true } as const

type Candidate = Pick<Manager, 'email' | 'id' | 'magicLinkIssuedAt' | 'name' | 'type'>

/**
 * `POST /api/managers/request-link`
 *
 * Trades an email address for an emailed sign-in link.
 *
 * Auth: **intentionally anonymous** — a manager who cannot sign in is exactly
 * who asks for one, so no guard is possible here. It is absent from the OpenAPI
 * client spec for the same reason `set-project` is: `managers` is admin-only
 * and in no project, so it publishes no public paths.
 *
 * ⚠ **The response is identical for every outcome** — a link sent, an address
 * no manager holds, an `inactive` manager, and a repeat inside the throttle
 * window. Any difference is an account-enumeration oracle on an anonymous
 * endpoint, and the throttle is the sharpest one: a 429 would tell the caller
 * the address is real *and* recently used. The work still differs (an unknown
 * address neither writes nor sends), so this is uniform in status and body
 * rather than in elapsed time; closing the timing channel would mean paying for
 * a send that is not happening.
 */
export const requestLink: Endpoint = {
  path: REQUEST_LINK_PATH,
  method: 'post',
  handler: async (req) => {
    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response

    try {
      await issueLink(req, parsed.data.email)
    } catch (error) {
      // Never surfaced: a transport failure that reached the caller would be an
      // oracle too, since only a real address gets as far as a send.
      req.payload.logger.error({
        msg: 'requestLink: could not issue a sign-in link',
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return Response.json(ACCEPTED)
  },
}

/** Mint, stamp and send, or do nothing. Never reports which. */
async function issueLink(req: PayloadRequest, email: string): Promise<void> {
  const { payload } = req

  // Bounded: this is the one unauthenticated read in the feature, and the
  // fields below are everything it consumes.
  const { docs } = await payload.find({
    collection: 'managers',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    joins: false,
    overrideAccess: true,
    select: { email: true, magicLinkIssuedAt: true, name: true, type: true },
  })

  const manager: Candidate | undefined = docs[0]
  if (!manager) return

  // Read off the fetched document, not `req.user` — this endpoint is anonymous,
  // so there is none. Same predicate as `requireActiveManager`.
  if (manager.type === 'inactive') return

  const now = new Date()
  const outstanding = manager.magicLinkIssuedAt
  if (outstanding && now.getTime() - new Date(outstanding).getTime() < REQUEST_LINK_THROTTLE_MS) {
    return
  }

  // Stamped before the send: the token's claim must match what is stored, and a
  // stamp written afterwards would leave a window where a delivered link
  // matches nothing. A failed send therefore costs the manager one throttle
  // window, which is the safer way round.
  await payload.update({
    collection: 'managers',
    id: manager.id,
    data: { magicLinkIssuedAt: now.toISOString() },
    depth: 0,
    overrideAccess: true,
  })

  const token = await signSigninToken(
    { collection: 'managers', issuedAt: now.getTime(), userId: manager.id },
    payload.secret,
    now,
  )

  const brand = getEmailBrand()
  await payload.sendEmail({
    to: manager.email,
    from: `${headerDisplayName(brand.productName)} <${MANAGER_EMAIL_FROM}>`,
    subject: stripNewlines(`Your sign-in link — ${brand.productName}`),
    // Inline, not queued, matching the verify and reset mail `Managers.auth`
    // already builds with `renderEmail`. The throttle above bounds the volume
    // this can generate, and a queued send would let the caller's request
    // return before delivery could fail.
    html: await renderEmail(
      createElement(SignInLinkEmail, {
        name: manager.name || manager.email,
        signInUrl: `${getServerUrl()}/api/managers${CONSUME_LINK_PATH}?token=${encodeURIComponent(token)}`,
        // Derived, so changing the TTL cannot leave the email saying otherwise.
        validFor: `${SIGNIN_TOKEN_TTL_MS / 60_000} minutes`,
      }),
    ),
  })
}
