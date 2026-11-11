import type { LoginCollectionConfig } from '../types'
import type { Endpoint } from 'payload'

import { getServerUrl } from '@/lib/utilities/serverUrl'

import { hasAcceptedFlag } from '../magicLinks'
import { preflight } from '../preflight'
import { createSession, sessionCookie } from '../session'

export const REDEEM_PATH = '/redeem'

/**
 * `POST /api/<slug>/redeem?token=…` — spend any delivered link for a session,
 * and redirect.
 *
 * ⚠ **One route for all three kinds, and the audiences stay separate.** The
 * token's own audience picks its reader (`readAnyLoginToken`), and that reader
 * verifies the same audience, so an invitation still cannot be spent as a
 * sign-in link. What differs by kind — single use, the landing page, the
 * refusal wording — is {@link preflight}'s per-kind rules.
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
      const checked = await preflight({
        config,
        payload,
        token: typeof req.query?.token === 'string' ? req.query.token : null,
      })
      if (checked.status === 'refused') return refuse(checked.reason)
      const { account, rules } = checked

      // Only where the collection has the column — see `hasAcceptedFlag`.
      const acceptedFlag = hasAcceptedFlag(payload, slug) ? { _verified: true } : {}

      // ⚠ One conditional UPDATE, because `preflight`'s spent check is a read:
      // two concurrent POSTs both pass it, and only the one that clears the
      // stamp may sign in. Payload's own `forgotPassword` reserves the same way.
      if (rules.spends) {
        const spent = await payload.db.updateOne({
          collection: slug,
          where: {
            and: [{ id: { equals: account.id } }, { magicLinkIssuedAt: { equals: rules.spends } }],
          },
          data: { magicLinkIssuedAt: null },
          options: { atomic: true },
        })
        if (!spent) return refuse('invalid')
      }

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
