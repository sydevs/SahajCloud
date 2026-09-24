import type { LoginCollectionConfig, LoginDocument } from '../types'
import type { Endpoint } from 'payload'

import { generatePayloadCookie } from 'payload/shared'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { noticePage } from '../page'
import { createSession } from '../session'
import { readSigninToken } from '../token'

export const REDEEM_MAGIC_LINK_PATH = '/redeem-magic-link'

/** Where a consumed link lands the holder, unless the collection names another. */
const DEFAULT_REDIRECT = '/admin'

/**
 * `POST /api/<slug>/redeem-magic-link?token=…`
 *
 * Trades a valid sign-in link for a session cookie and redirects the holder.
 * `loginPlugin` builds one of these per entry in its `collections` option.
 *
 * Auth: **intentionally anonymous**, like its `request-magic-link` sibling — the
 * token is the credential. Absent from the OpenAPI client spec for the same
 * reason `set-project` is: the collections this serves are admin-only and in no
 * project, so they publish no public paths.
 *
 * ⚠ **`POST` is what keeps a mail scanner from spending the link**, and the
 * method is the mechanism, not a convention. Nothing here may answer a `GET`:
 * `confirmMagicLink` holds that method on this same path and burns nothing, so
 * a Safe Links or Proofpoint fetch of the emailed URL costs the recipient
 * their one use only if this handler ever accepts one.
 *
 * ⚠ **The token arrives in the query string, not the body.** The form on the
 * confirmation page carries it in its action, because a custom Payload endpoint
 * is handed no parsed form body — `parseBody` reads JSON, which a form submit
 * does not send.
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
  const { requestPagePath, slug } = config

  /** An authentic link whose clock ran out. The one refusal worth distinguishing. */
  const expired = () =>
    noticePage(410, 'This link has expired', 'Request a new sign-in link.', requestPagePath)

  // Everything else: tampered, wrong audience, already used, or minted for an
  // account that has since stopped qualifying. Collapsed into one answer on
  // purpose — separating them would describe our checks to whoever is probing
  // them. Both close over `requestPagePath` rather than taking it, so no refusal
  // below can drop the retry link by forgetting an argument.
  const invalid = () =>
    noticePage(400, 'This link is not valid', 'Request a new sign-in link.', requestPagePath)

  return {
    path: REDEEM_MAGIC_LINK_PATH,
    method: 'post',
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
          // See the same cast in `requestMagicLink`: `joins` collapses over the slug union.
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
      // from this one equality: `requestMagicLink` stamps the field with the same
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
