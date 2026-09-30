import type { LinkTokenClaims, LoginTokenClaims } from './token'
import type { LoginCollectionConfig, LoginDocument } from './types'
import type { Endpoint, Payload, SelectType } from 'payload'

import { parseBody } from '@/lib/endpoints'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { SignedTokenResult } from '@/lib/utilities/signedToken'

import { hasAcceptedFlag, issueMagicLink, magicLinkEmailSchema } from './magicLinks'
import { createSession, sessionCookie } from './session'
import { seedTabPreference } from './tabPreference'
import { readInviteToken, readLinkToken, readSigninToken } from './token'

/**
 * The four routes `loginPlugin` adds to every collection it serves, all under
 * `/api/<slug>`: one that asks for a link, and three that spend one — a
 * sign-in link, an invitation, and a reminder's page link.
 *
 * Auth: **intentionally anonymous**, all four. An account that cannot sign in
 * is exactly who asks for a link, and for the other three the token is the
 * credential. They are absent from the OpenAPI client spec for the same reason
 * `set-project` is: the collections this serves are admin-only and in no
 * project, so they publish no public paths.
 */

export const REQUEST_MAGIC_LINK_PATH = '/request-magic-link'
export const REDEEM_MAGIC_LINK_PATH = '/redeem-magic-link'
export const REDEEM_INVITE_PATH = '/redeem-invite'
export const REDEEM_LINK_PATH = '/redeem-link'

/** Every route, in the order a served collection gains them. */
export function loginEndpoints(config: LoginCollectionConfig): Endpoint[] {
  return [
    requestMagicLink(config),
    // Single use, and mutual exclusion between outstanding links, both come
    // from this one equality: `issueMagicLink` stamps the field with the same
    // instant it signs into the claim, so a consumed or superseded link no
    // longer matches. Compared as numbers — see `LoginTokenClaims.issuedAt`.
    redeemToken(config, {
      path: REDEEM_MAGIC_LINK_PATH,
      read: readSigninToken,
      expiredReason: 'expired',
      select: { magicLinkIssuedAt: true },
      isUnspent: ({ magicLinkIssuedAt }, claims) =>
        Boolean(magicLinkIssuedAt) && new Date(magicLinkIssuedAt!).getTime() === claims.issuedAt,
    }),
    // ⚠ **A separate route because the audiences are separate**, so a 7-day
    // invitation cannot be replayed as a 15-minute sign-in link. `_verified` is
    // what makes it single-use: an invitation stamps nothing, so the flag the
    // acceptance sets is the only thing that can refuse the second click. A
    // manager assigned to two projects gets two invitations, and whichever they
    // accept second is refused as `invite-accepted` — they are in already.
    redeemToken(config, {
      path: REDEEM_INVITE_PATH,
      read: readInviteToken,
      expiredReason: 'invite-expired',
      spentReason: 'invite-accepted',
      isUnspent: (account) => account._verified !== true,
    }),
    // ⚠ **Not single-use.** A reminder is re-read and clicked twice, and it
    // names a page rather than granting anything a sign-in link would not. It
    // still expires, and still refuses an account that has stopped qualifying.
    redeemToken<LinkTokenClaims>(config, {
      path: REDEEM_LINK_PATH,
      read: readLinkToken,
      expiredReason: 'link-expired',
      isUnspent: () => true,
      // Checked at signing and at reading (`isAdminPath`), so this is always an
      // admin path this server chose.
      redirectTo: (claims) => claims.to,
      // An invitation's "Configure notifications" lands on the account page's
      // Contact tab, which Payload offers no URL for.
      afterRedeem: async ({ account, claims, payload }) => {
        if (!claims.tab) return
        await seedTabPreference({ collection: config.slug, payload, tab: claims.tab, userId: account.id })
      },
    }),
  ]
}

/** What every caller of the request route sees, whatever happened. */
const ACCEPTED = { ok: true } as const

/**
 * `POST /api/<slug>/request-magic-link` — trade an address for an emailed
 * sign-in link. The work is `issueMagicLink`, shared with the sign-in page.
 *
 * ⚠ **The response is identical for every outcome** — a link sent, an address
 * nobody holds, a document `isEligible` rejects, and a repeat inside the
 * throttle window. Any difference is an account-enumeration oracle on an
 * anonymous endpoint, and the throttle is the sharpest one: a 429 would tell the
 * caller the address is real *and* recently used. The work still differs (an
 * unknown address neither writes nor sends), so this is uniform in status and
 * body rather than in elapsed time.
 *
 * ⚠ **One exception, on a Railway preview only.** `previewAutoSignIn` answers
 * its one address with a session — `token` in the body for the smoke lane, and
 * the cookie for a browser. The option is unset everywhere the uniform answer
 * could be read as an oracle.
 */
function requestMagicLink(config: LoginCollectionConfig): Endpoint {
  return {
    path: REQUEST_MAGIC_LINK_PATH,
    method: 'post',
    handler: async (req) => {
      const parsed = await parseBody(req, magicLinkEmailSchema)
      if (!parsed.ok) return parsed.response

      try {
        const signedIn = await issueMagicLink({ payload: req.payload, config, email: parsed.data.email })
        if (signedIn) {
          return Response.json(
            { ...ACCEPTED, token: signedIn.token },
            { headers: { 'Set-Cookie': sessionCookie(req.payload, config.slug, signedIn.token) } },
          )
        }
      } catch (error) {
        // Never surfaced: a transport failure that reached the caller would be an
        // oracle too, since only a real address gets as far as a send.
        req.payload.logger.error({
          msg: 'requestMagicLink: could not issue a sign-in link',
          collection: config.slug,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      return Response.json(ACCEPTED)
    },
  }
}

/** What separates one redeem route from another. Everything else is shared. */
interface RedeemSpec<C extends LoginTokenClaims> {
  path: string
  /** The reader for this route's audience. Refusing the others' tokens is its job. */
  read: (token: null | string, secret: string) => Promise<SignedTokenResult<C>>
  /** The reason an authentic-but-elapsed token redirects with. */
  expiredReason: string
  /** Whether this token has not been spent yet — the one check the routes do not share. */
  isUnspent: (account: LoginDocument, claims: C) => boolean
  /** The reason a spent token redirects with, where saying so helps. Otherwise `invalid`. */
  spentReason?: string
  /** The fields `isUnspent` reads, on top of the collection's own `select`. */
  select?: SelectType
  /**
   * Where the session lands, when the token names it. Read from the signed
   * claims only — never from the request — so no caller can steer it.
   */
  redirectTo?: (claims: C) => string
  /**
   * Work to do once the session exists, before the redirect. A failure costs
   * only that work: it is logged, and the holder is still signed in.
   */
  afterRedeem?: (args: { account: LoginDocument; claims: C; payload: Payload }) => Promise<void>
}

/**
 * `POST /api/<slug>/<path>?token=…` — spend a delivered token for a session,
 * and redirect.
 *
 * ⚠ **`POST` is the whole defence against a mail scanner spending the token**,
 * and the method is the mechanism, not a convention. Nothing here may answer a
 * `GET`: Defender Safe Links and Proofpoint issue one on every link in an
 * inbound message before its recipient sees it, so a `GET` that burned the
 * token would hand the scanner the manager's one use. The emailed link
 * addresses `requestPagePath`'s page, which reads the token and writes nothing,
 * and this handler sits behind that page's form.
 *
 * ⚠ **The token arrives in the query string, not the body.** The page's form
 * carries it in its action, because a custom Payload endpoint is handed no
 * parsed form body — `parseBody` reads JSON, which a form submit does not send.
 *
 * ⚠ **It redirects rather than returning the user.** The localized-roles hooks
 * reshape an auth *response* (`afterLogin` / `afterMe` / `afterRefresh`), so a
 * hand-built body here would carry flat, single-locale `roles`. `afterMe`
 * resolves them on the next `GET /api/<slug>/me` instead.
 *
 * ⚠ **`Response.redirect()` returns immutable headers**, so `Set-Cookie`
 * cannot be appended to one. The 302s below are built by hand for that reason.
 */
function redeemToken<C extends LoginTokenClaims = LoginTokenClaims>(
  config: LoginCollectionConfig,
  spec: RedeemSpec<C>,
): Endpoint {
  const { requestPagePath, slug } = config

  /**
   * Every refusal goes back to the page the link came from, which explains it
   * and offers the form that fixes it — this plugin renders no HTML of its own.
   * Safe here and nowhere else: a scanner never issues the `POST` that reaches
   * this.
   *
   * Only an authentic-but-elapsed token (and, where `spentReason` says so, a
   * spent one) is told apart. Tampered, the other audience, a deleted or
   * ineligible account — all `invalid`, because separating them would describe
   * our checks to whoever is probing them.
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

  return {
    path: spec.path,
    method: 'post',
    handler: async (req) => {
      const { payload } = req
      const token = typeof req.query?.token === 'string' ? req.query.token : null

      const result = await spec.read(token, payload.secret)
      if (result.status === 'expired') return refuse(spec.expiredReason)
      // ⚠ The claim names its own collection, and this equality is what keeps
      // the audiences from having to. A token minted for one served collection
      // cannot sign anyone into another.
      if (result.status !== 'valid' || result.claims.collection !== slug) return refuse('invalid')
      const { claims } = result

      // Only where the collection has the column — see `hasAcceptedFlag`.
      const acceptedFlag = hasAcceptedFlag(payload, slug) ? { _verified: true } : {}

      let account: LoginDocument
      try {
        account = (await payload.findByID({
          collection: slug,
          id: claims.userId,
          depth: 0,
          // `joins` narrows per collection, so over the slug union it collapses
          // to `undefined`; the result widens for the same reason.
          joins: false as never,
          overrideAccess: true,
          select: { ...acceptedFlag, ...spec.select, ...config.select },
        })) as unknown as LoginDocument
      } catch {
        // A deleted account. `findByID` throws `NotFound` rather than returning null.
        return refuse('invalid')
      }

      // Re-checked here, not only at request time: an account deactivated while
      // a token was outstanding must not be able to spend it.
      if (config.isEligible && !config.isEligible(account)) return refuse('invalid')

      // Reached only with an authentic, unexpired token for an existing,
      // eligible account — so naming it spent tells nothing to anyone probing.
      if (!spec.isUnspent(account, claims)) return refuse(spec.spentReason ?? 'invalid')

      // ⚠ Deliberately its own operation, not joined to `req`'s transaction:
      // burning the token must survive a failure to mint below.
      //
      // `_verified` rides along because the JWT strategy yields no user while it
      // is false — the session below would authenticate nobody, on a token
      // already spent. Following a link delivered to the stored address is the
      // same proof of ownership the verify mail asks for. `magicLinkIssuedAt` is
      // cleared because a resent invitation stamps it, and leaving it set would
      // throttle the sign-in link this holder may ask for next.
      await payload.update({
        collection: slug,
        id: account.id,
        data: { ...acceptedFlag, magicLinkIssuedAt: null } as never,
        depth: 0,
        overrideAccess: true,
      })

      const cookie = sessionCookie(payload, slug, await createSession(payload, slug, account.id))

      await spec.afterRedeem?.({ account, claims, payload }).catch((error: unknown) => {
        payload.logger.warn({ msg: `${spec.path}: after-redeem step failed`, err: error })
      })

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${getServerUrl()}${spec.redirectTo?.(claims) ?? payload.config.routes.admin}`,
          'Set-Cookie': cookie,
        },
      })
    },
  }
}
