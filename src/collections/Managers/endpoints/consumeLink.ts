import type { Endpoint } from 'payload'

import { generatePayloadCookie } from 'payload/shared'

import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { Manager } from '@/payload-types'
import { createSession } from '@/plugins/login/session'
import { readSigninToken } from '@/plugins/login/token'

export const CONSUME_LINK_PATH = '/consume-link'

/** An authentic link whose clock ran out. The one refusal worth distinguishing. */
const expired = () =>
  Response.json(
    { errors: [{ message: 'This sign-in link has expired. Request a new one.' }] },
    { status: 410 },
  )

/**
 * Everything else: tampered, wrong audience, already used, or minted for a
 * manager who has since been deactivated. Collapsed into one answer on purpose
 * — separating them would describe our checks to whoever is probing them.
 */
const invalid = () =>
  Response.json({ errors: [{ message: 'This sign-in link is not valid.' }] }, { status: 400 })

type Candidate = Pick<Manager, 'id' | 'magicLinkIssuedAt' | 'type'>

/**
 * `GET /api/managers/consume-link?token=…`
 *
 * Trades a valid sign-in link for a session cookie and sends the holder to the
 * admin panel.
 *
 * Auth: **intentionally anonymous**, like its `request-link` sibling — the
 * token is the credential. Absent from the OpenAPI client spec for the same
 * reason `set-project` is: `managers` is admin-only and in no project, so it
 * publishes no public paths.
 *
 * ⚠ **It redirects rather than returning the user.** The localized-roles hooks
 * reshape an auth *response* (`afterLogin` / `afterMe` / `afterRefresh`), so a
 * hand-built body here would carry flat, single-locale `roles` that nothing
 * else in the app hands out. The redirect sidesteps that; `afterMe` resolves
 * roles on the next `GET /api/managers/me`.
 *
 * ⚠ **`Response.redirect()` returns immutable headers**, so `Set-Cookie`
 * cannot be appended to one. The 302 below is built by hand for that reason.
 *
 * ⚠ **A `GET` here spends the link.** Link-scanning mail security (Defender
 * Safe Links, Proofpoint) fetches URLs in inbound mail, so a scanner can burn
 * the link before the recipient clicks it, and `request-link`'s throttle then
 * refuses the obvious retry for 60 seconds. When a manager reports that the
 * link is not valid, check this first. The usual fix is an interstitial page
 * that POSTs the token; it is not built, because nobody has hit this yet.
 */
export const consumeLink: Endpoint = {
  path: CONSUME_LINK_PATH,
  method: 'get',
  handler: async (req) => {
    const { payload } = req
    const token = typeof req.query?.token === 'string' ? req.query.token : null

    const result = await readSigninToken(token, payload.secret)
    if (result.status === 'expired') return expired()
    if (result.status !== 'valid') return invalid()

    const { claims } = result
    // The claim names its own collection, so a token minted for a future auth
    // collection cannot sign anyone into `managers`.
    if (claims.collection !== 'managers') return invalid()

    let manager: Candidate
    try {
      manager = await payload.findByID({
        collection: 'managers',
        id: claims.userId,
        depth: 0,
        joins: false,
        overrideAccess: true,
        select: { magicLinkIssuedAt: true, type: true },
      })
    } catch {
      // A deleted manager. `findByID` throws `NotFound` rather than returning null.
      return invalid()
    }

    if (manager.type === 'inactive') return invalid()

    // Single use, and mutual exclusion between outstanding links, both come
    // from this one equality: `requestLink` stamps the field with the same
    // instant it signs into the claim, so a consumed or superseded link no
    // longer matches. Compared as numbers — see `LoginTokenClaims.issuedAt`.
    const stamped = manager.magicLinkIssuedAt
    if (!stamped || new Date(stamped).getTime() !== claims.issuedAt) return invalid()

    // ⚠ Deliberately its own operation, and deliberately not joined to `req`'s
    // transaction. Burning the link must survive a failure to mint below — a
    // shared transaction would roll the clear back and leave the link live.
    //
    // `_verified` rides along because `Managers.auth.verify` is configured, and
    // the JWT strategy yields no user while the flag is false — the session
    // minted below would then authenticate nobody, on a link already spent.
    // Following a link delivered to the stored address is the same proof of
    // ownership the verify mail asks for.
    await payload.update({
      collection: 'managers',
      id: manager.id,
      data: { _verified: true, magicLinkIssuedAt: null },
      depth: 0,
      overrideAccess: true,
    })

    const sessionToken = await createSession(payload, 'managers', manager.id)

    // `generatePayloadCookie` derives the expiry from the collection's own
    // `tokenExpiration`, so it needs no `getCookieExpiration` call here.
    const cookie = generatePayloadCookie({
      collectionAuthConfig: payload.collections.managers.config.auth,
      cookiePrefix: payload.config.cookiePrefix,
      token: sessionToken,
    })

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${getServerUrl()}/admin`,
        'Set-Cookie': cookie,
      },
    })
  },
}
