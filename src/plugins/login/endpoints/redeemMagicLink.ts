import type { LoginCollectionConfig, LoginDocument } from '../types'
import type { Endpoint } from 'payload'

import { generatePayloadCookie } from 'payload/shared'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { createSession } from '../session'
import { readSigninToken } from '../token'

export const CONSUME_LINK_PATH = '/consume-link'

/** Where a consumed link lands the holder, unless the collection names another. */
const DEFAULT_REDIRECT = '/admin'

/** An authentic link whose clock ran out. The one refusal worth distinguishing. */
const expired = () =>
  Response.json(
    { errors: [{ message: 'This sign-in link has expired. Request a new one.' }] },
    { status: 410 },
  )

/**
 * Everything else: tampered, wrong audience, already used, or minted for an
 * account that has since stopped qualifying. Collapsed into one answer on
 * purpose — separating them would describe our checks to whoever is probing them.
 */
const invalid = () =>
  Response.json({ errors: [{ message: 'This sign-in link is not valid.' }] }, { status: 400 })

/**
 * `GET /api/<slug>/consume-link?token=…`
 *
 * Trades a valid sign-in link for a session cookie and redirects the holder.
 * `loginPlugin` builds one of these per entry in its `collections` option.
 *
 * Auth: **intentionally anonymous**, like its `request-link` sibling — the
 * token is the credential. Absent from the OpenAPI client spec for the same
 * reason `set-project` is: the collections this serves are admin-only and in no
 * project, so they publish no public paths.
 *
 * ⚠ **A `GET` here spends the link.** Link-scanning mail security (Defender
 * Safe Links, Proofpoint) fetches URLs in inbound mail, so a scanner can burn
 * the link before the recipient clicks it, and `request-link`'s throttle then
 * refuses the obvious retry for 60 seconds. When someone reports that the link
 * is not valid, check this first. The usual fix is an interstitial page that
 * POSTs the token; it is not built, because nobody has hit this yet.
 *
 * ⚠ **It redirects rather than returning the user.** The localized-roles hooks
 * reshape an auth *response* (`afterLogin` / `afterMe` / `afterRefresh`), so a
 * hand-built body here would carry flat, single-locale `roles` that nothing
 * else in the app hands out. The redirect sidesteps that; `afterMe` resolves
 * roles on the next `GET /api/<slug>/me`.
 *
 * ⚠ **`Response.redirect()` returns immutable headers**, so `Set-Cookie`
 * cannot be appended to one. The 302 below is built by hand for that reason.
 */
export function redeemMagicLink(config: LoginCollectionConfig): Endpoint {
  const { slug } = config

  return {
    path: CONSUME_LINK_PATH,
    method: 'get',
    handler: async (req) => {
      const { payload } = req
      const token = typeof req.query?.token === 'string' ? req.query.token : null

      const result = await readSigninToken(token, payload.secret)
      if (result.status === 'expired') return expired()
      if (result.status !== 'valid') return invalid()

      const { claims } = result
      // ⚠ The claim names its own collection, and this equality is what keeps the
      // audiences from having to. A token minted for one configured collection
      // cannot sign anyone into another.
      if (claims.collection !== slug) return invalid()

      let account: LoginDocument
      try {
        account = (await payload.findByID({
          collection: slug,
          id: claims.userId,
          depth: 0,
          // See the same cast in `requestSessionLink`: `joins` collapses over the slug union.
          joins: false as never,
          overrideAccess: true,
          select: { magicLinkIssuedAt: true, ...config.select },
        })) as LoginDocument
      } catch {
        // A deleted account. `findByID` throws `NotFound` rather than returning null.
        return invalid()
      }

      // Re-checked here, not only at request time: an account deactivated while
      // a link was outstanding must not be able to spend it.
      if (config.isEligible && !config.isEligible(account)) return invalid()

      // Single use, and mutual exclusion between outstanding links, both come
      // from this one equality: `requestSessionLink` stamps the field with the same
      // instant it signs into the claim, so a consumed or superseded link no
      // longer matches. Compared as numbers — see `LoginTokenClaims.issuedAt`.
      const stamped = account.magicLinkIssuedAt
      if (!stamped || new Date(stamped).getTime() !== claims.issuedAt) return invalid()

      // ⚠ Deliberately its own operation, and deliberately not joined to `req`'s
      // transaction. Burning the link must survive a failure to mint below — a
      // shared transaction would roll the clear back and leave the link live.
      //
      // `_verified` rides along because an auth collection may configure
      // `auth.verify`, and the JWT strategy yields no user while the flag is
      // false — the session minted below would then authenticate nobody, on a
      // link already spent. Following a link delivered to the stored address is
      // the same proof of ownership the verify mail asks for. Harmless on a
      // collection without `verify`: the field exists on every auth collection.
      await payload.update({
        collection: slug,
        id: account.id,
        data: { _verified: true, magicLinkIssuedAt: null } as never,
        depth: 0,
        overrideAccess: true,
      })

      const sessionToken = await createSession(payload, slug, account.id)

      // `generatePayloadCookie` derives the expiry from the collection's own
      // `tokenExpiration`, so it needs no `getCookieExpiration` call here.
      const cookie = generatePayloadCookie({
        collectionAuthConfig: payload.collections[slug]!.config.auth,
        cookiePrefix: payload.config.cookiePrefix,
        token: sessionToken,
      })

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${getServerUrl()}${config.redirectTo ?? DEFAULT_REDIRECT}`,
          'Set-Cookie': cookie,
        },
      })
    },
  }
}
