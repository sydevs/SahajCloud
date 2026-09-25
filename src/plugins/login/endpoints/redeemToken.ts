import type { LoginCollectionConfig, LoginDocument } from '../types'
import type { LoginTokenClaims, LoginTokenResult } from '../token'
import type { Endpoint, SelectType } from 'payload'

import { generatePayloadCookie } from 'payload/shared'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { createSession } from '../session'

/** Where a spent token lands the holder, unless the collection names another. */
const DEFAULT_REDIRECT = '/admin'

/**
 * What separates one redeem route from the other. Everything else — the
 * refusals, the eligibility re-check, the burn, the cookie and the 302 — is
 * identical, so it lives below rather than in two files.
 */
interface RedeemSpec {
  /** The reason an authentic-but-elapsed token redirects with. */
  expiredReason: string
  /**
   * Whether this token has not been spent yet. The one check the two routes do
   * not share: a sign-in link matches the stamp it was minted against, an
   * invitation has only the accepted flag.
   */
  isUnspent: (account: LoginDocument, claims: LoginTokenClaims) => boolean
  path: string
  /** The reader for this route's audience. Refusing the other's token is its job. */
  read: (token: null | string, secret: string) => Promise<LoginTokenResult>
  /** The fields `isUnspent` reads, on top of the collection's own `select`. */
  select: SelectType
}

/**
 * The body both `redeem-magic-link` and `redeem-invite` run.
 *
 * ⚠ **`POST` is the whole defence against a mail scanner spending the token**,
 * and the method is the mechanism, not a convention. Nothing here may answer a
 * `GET`: Defender Safe Links and Proofpoint issue one on every link in an
 * inbound message before its recipient sees it, so a `GET` that burned the
 * token would hand the scanner the manager's one use — and the 60-second
 * throttle would then refuse the obvious retry. The emailed link therefore
 * addresses `requestPagePath`'s page, which reads the token and writes nothing,
 * and this handler sits behind that page's form. Any automatic submission added
 * to that page restores the hazard.
 *
 * ⚠ **The token arrives in the query string, not the body.** The form on that
 * page carries it in its action, because a custom Payload endpoint is handed no
 * parsed form body — `parseBody` reads JSON, which a form submit does not send.
 *
 * ⚠ **It redirects rather than returning the user.** The localized-roles hooks
 * reshape an auth *response* (`afterLogin` / `afterMe` / `afterRefresh`), so a
 * hand-built body here would carry flat, single-locale `roles` that nothing
 * else in the app hands out. The redirect sidesteps that; `afterMe` resolves
 * roles on the next `GET /api/<slug>/me`.
 *
 * ⚠ **`Response.redirect()` returns immutable headers**, so `Set-Cookie`
 * cannot be appended to one. The 302 below is built by hand for that reason.
 *
 * Auth: **intentionally anonymous**, like the `request-magic-link` sibling —
 * the token is the credential. Absent from the OpenAPI client spec for the same
 * reason `set-project` is: the collections this serves are admin-only and in no
 * project, so they publish no public paths.
 */
export function redeemToken(config: LoginCollectionConfig, spec: RedeemSpec): Endpoint {
  const { requestPagePath, slug } = config

  /**
   * Every refusal goes back to the page the link came from, which explains it
   * and offers the form that fixes it.
   *
   * ⚠ **A redirect, not a page.** This plugin renders no HTML of its own: one
   * page asks for a link, confirms a delivered one, and explains a refused one,
   * so a refusal cannot arrive in a second visual language. Safe here and
   * nowhere else — a scanner never issues the `POST` that reaches this.
   */
  const refuse = (reason: string) =>
    new Response(null, {
      status: 302,
      headers: {
        // `no-store` is load-bearing: the URL this answers carries the
        // credential in its query string.
        'Cache-Control': 'no-store',
        Location: `${getServerUrl()}${requestPagePath}?error=${reason}`,
        'Referrer-Policy': 'no-referrer',
      },
    })

  /** An authentic token whose clock ran out. The one refusal worth distinguishing. */
  const expired = () => refuse(spec.expiredReason)

  // Everything else: tampered, the other audience, already spent, or minted for
  // an account that has since stopped qualifying. Collapsed into one answer on
  // purpose — separating them would describe our checks to whoever is probing
  // them.
  const invalid = () => refuse('invalid')

  return {
    path: spec.path,
    method: 'post',
    handler: async (req) => {
      const { payload } = req
      const token = typeof req.query?.token === 'string' ? req.query.token : null

      const result = await spec.read(token, payload.secret)
      if (result.status === 'expired') return expired()
      if (result.status !== 'valid') return invalid()

      const { claims } = result
      // ⚠ The claim names its own collection, and this equality is what keeps
      // the audiences from having to. A token minted for one configured
      // collection cannot sign anyone into another.
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
          select: { ...spec.select, ...config.select },
          // Through `unknown`: a `SelectType` built at runtime tells `findByID`
          // nothing about which fields survive, so its return widens to the
          // whole slug union rather than the narrowed shape a literal gave.
        })) as unknown as LoginDocument
      } catch {
        // A deleted account. `findByID` throws `NotFound` rather than returning null.
        return invalid()
      }

      // Re-checked here, not only at request time: an account deactivated while
      // a token was outstanding must not be able to spend it.
      if (config.isEligible && !config.isEligible(account)) return invalid()

      if (!spec.isUnspent(account, claims)) return invalid()

      // ⚠ Deliberately its own operation, and deliberately not joined to `req`'s
      // transaction. Burning the token must survive a failure to mint below — a
      // shared transaction would roll the clear back and leave the token live.
      //
      // `_verified` rides along because the JWT strategy yields no user while
      // that flag is false — the session minted below would then authenticate
      // nobody, on a token already spent. Following a link delivered to the
      // stored address is the same proof of ownership the verify mail asks for.
      // `magicLinkIssuedAt` is cleared because a resent invitation stamps it,
      // and leaving it set would throttle the sign-in link this account holder
      // may ask for next.
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
