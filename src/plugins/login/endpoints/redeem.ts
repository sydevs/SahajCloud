import type { LoginToken, LoginTokenKind } from '../token'
import type { LoginCollectionConfig, LoginDocument } from '../types'
import type { Endpoint, Payload, SelectType } from 'payload'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { hasAcceptedFlag } from '../magicLinks'
import { createSession, sessionCookie } from '../session'
import { seedTabPreference } from '../tabPreference'
import { readAnyLoginToken } from '../token'

export const REDEEM_PATH = '/redeem'

/**
 * The `?error=` an authentic-but-elapsed token of each kind is sent back with.
 * Each kind's lifetime differs, so the sign-in page words each differently.
 */
export const EXPIRED_REASON = {
  invite: 'invite-expired',
  link: 'link-expired',
  signin: 'expired',
} as const satisfies Record<LoginTokenKind, string>

/** What one kind of token does differently once it checks out. */
interface KindRules {
  /** The fields `isUnspent` reads, on top of the collection's own `select`. */
  select?: SelectType
  /** Whether this token has not been spent yet. */
  isUnspent: (account: LoginDocument) => boolean
  /** The `?error=` a spent token is sent back with, where saying so helps. Otherwise `invalid`. */
  spentReason?: string
  /** Where the session lands. Read from the signed claims, never the request. */
  redirectTo?: string
  /**
   * Work to do once the session exists, before the redirect. A failure costs
   * only that work: it is logged, and the holder is still signed in.
   */
  afterRedeem?: (args: { account: LoginDocument; payload: Payload }) => Promise<void>
}

function rulesFor(config: LoginCollectionConfig, token: LoginToken): KindRules {
  switch (token.kind) {
    case 'signin':
      // Single use, and mutual exclusion between outstanding links, both come
      // from this one equality: `issueMagicLink` stamps the field with the same
      // instant it signs into the claim, so a consumed or superseded link no
      // longer matches. Compared as numbers — see `LoginTokenClaims.issuedAt`.
      return {
        select: { magicLinkIssuedAt: true },
        isUnspent: ({ magicLinkIssuedAt }) =>
          Boolean(magicLinkIssuedAt) &&
          new Date(magicLinkIssuedAt!).getTime() === token.claims.issuedAt,
      }
    case 'invite':
      // `_verified` is what makes an invitation single-use: it stamps nothing,
      // so the flag the acceptance sets is the only thing that can refuse the
      // second click. A manager assigned to two projects gets two invitations,
      // and whichever they accept second is spent — they are in already, so say so.
      return {
        isUnspent: (account) => account._verified !== true,
        spentReason: 'invite-accepted',
      }
    case 'link': {
      // ⚠ **Not single-use.** A reminder is re-read and clicked twice, and it
      // names a page rather than granting anything a sign-in link would not.
      // It still expires, and still refuses an account that stops qualifying.
      const { tab, to } = token.claims
      return {
        isUnspent: () => true,
        // Checked at signing and at reading (`isAdminPath`), so this is always
        // an admin path this server chose.
        redirectTo: to,
        // An invitation's "Configure notifications" lands on the account page's
        // Contact tab, which Payload offers no URL for.
        afterRedeem: tab
          ? ({ account, payload }) =>
              seedTabPreference({ collection: config.slug, payload, tab, userId: account.id })
          : undefined,
      }
    }
  }
}

/**
 * `POST /api/<slug>/redeem?token=…` — spend any delivered link for a session,
 * and redirect.
 *
 * ⚠ **One route for all three kinds, and the audiences stay separate.** The
 * token's own audience picks its reader (`readAnyLoginToken`), and that reader
 * verifies the same audience, so an invitation still cannot be spent as a
 * sign-in link. What differs by kind — single use, the landing page, the
 * refusal wording — is {@link rulesFor}.
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
 *
 * Auth: **intentionally anonymous** — the token is the credential. Absent from
 * the OpenAPI client spec, like `request-magic-link`.
 */
export function redeem(config: LoginCollectionConfig): Endpoint {
  const { requestPagePath, slug } = config

  /**
   * Every refusal goes back to the page the link came from, which explains it
   * and offers the form that fixes it — this plugin renders no HTML of its own.
   * Safe here and nowhere else: a scanner never issues the `POST` that reaches
   * this.
   *
   * Only an authentic-but-elapsed token (and, where the kind says so, a spent
   * one) is told apart. Tampered, a deleted or ineligible account — all
   * `invalid`, because separating them would describe our checks to whoever is
   * probing them.
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
    path: REDEEM_PATH,
    method: 'post',
    handler: async (req) => {
      const { payload } = req
      const read = await readAnyLoginToken(
        typeof req.query?.token === 'string' ? req.query.token : null,
        payload.secret,
      )
      if (read.status === 'expired') return refuse(EXPIRED_REASON[read.kind])
      // ⚠ The claim names its own collection, and this equality is what keeps
      // the audiences from having to. A token minted for one served collection
      // cannot sign anyone into another.
      if (read.status !== 'valid' || read.token.claims.collection !== slug) return refuse('invalid')

      const rules = rulesFor(config, read.token)
      // Only where the collection has the column — see `hasAcceptedFlag`.
      const acceptedFlag = hasAcceptedFlag(payload, slug) ? { _verified: true } : {}

      let account: LoginDocument
      try {
        account = (await payload.findByID({
          collection: slug,
          id: read.token.claims.userId,
          depth: 0,
          // `joins` narrows per collection, so over the slug union it collapses
          // to `undefined`; the result widens for the same reason.
          joins: false as never,
          overrideAccess: true,
          select: { ...acceptedFlag, ...rules.select, ...config.select },
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
      if (!rules.isUnspent(account)) return refuse(rules.spentReason ?? 'invalid')

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

      await rules.afterRedeem?.({ account, payload }).catch((error: unknown) => {
        payload.logger.warn({ msg: `${REDEEM_PATH}: after-redeem step failed`, err: error })
      })

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${getServerUrl()}${rules.redirectTo ?? payload.config.routes.admin}`,
          'Set-Cookie': cookie,
        },
      })
    },
  }
}
