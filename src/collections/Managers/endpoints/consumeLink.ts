import type { CollectionSlug, Endpoint } from 'payload'

import { generatePayloadCookie } from 'payload/shared'

import { getServerUrl } from '@/lib/utilities/serverUrl'
import { createSession } from '@/plugins/login/session'
import { readSigninToken } from '@/plugins/login/token'

export const CONSUME_LINK_PATH = '/consume-link'

const refused = (status: number, message: string) =>
  Response.json({ errors: [{ message }] }, { status })

/** An authentic link whose clock ran out. The one refusal worth distinguishing. */
const EXPIRED = () =>
  refused(410, 'This sign-in link has expired. Request a new one.')

/**
 * Everything else: tampered, wrong audience, already used, or minted for a
 * manager who has since been deactivated. Collapsed into one answer on purpose
 * — separating them would describe our checks to whoever is probing them.
 */
const INVALID = () => refused(400, 'This sign-in link is not valid.')

interface Candidate {
  id: number | string
  magicLinkIssuedAt?: null | string
  type?: null | string
}

/**
 * `GET /api/<collection>/consume-link?token=…`
 *
 * Trades a valid sign-in link for a session cookie and sends the holder to the
 * admin panel.
 *
 * Auth: **intentionally anonymous**, like its `request-link` sibling — the
 * token is the credential. Absent from the OpenAPI client spec for the same
 * reason: `managers` is admin-only and in no project.
 *
 * ⚠ **It redirects rather than returning the user.** The localized-roles hooks
 * reshape an auth *response* (`afterLogin` / `afterMe` / `afterRefresh`), so a
 * hand-built body here would carry flat, single-locale `roles` that nothing
 * else in the app hands out. The redirect sidesteps that; `afterMe` resolves
 * roles on the next `GET /api/<collection>/me`.
 *
 * ⚠ **`Response.redirect()` returns immutable headers**, so `Set-Cookie`
 * cannot be appended to one. The 302 below is built by hand for that reason.
 */
export function consumeLink(collection: CollectionSlug): Endpoint {
  return {
    path: CONSUME_LINK_PATH,
    method: 'get',
    handler: async (req) => {
      const { payload } = req
      const token = typeof req.query?.token === 'string' ? req.query.token : null

      const result = await readSigninToken(token, payload.secret)
      if (result.status === 'expired') return EXPIRED()
      if (result.status !== 'valid') return INVALID()

      const { claims } = result
      if (claims.collection !== collection) return INVALID()

      let manager: Candidate | null = null
      try {
        manager = (await payload.findByID({
          collection,
          id: claims.userId,
          depth: 0,
          joins: false as never,
          overrideAccess: true,
        })) as Candidate
      } catch {
        // A deleted manager. `findByID` throws `NotFound` rather than returning null.
        return INVALID()
      }

      if (manager.type === 'inactive') return INVALID()

      // Single use, and mutual exclusion between outstanding links, both come
      // from this one equality: `requestLink` stamps the field with the same
      // instant it signs into the claim, so a consumed or superseded link no
      // longer matches. Compared as numbers — see `LoginTokenClaims.issuedAt`.
      const stamped = manager.magicLinkIssuedAt
      if (!stamped || new Date(stamped).getTime() !== claims.issuedAt) return INVALID()

      await payload.update({
        collection,
        id: manager.id,
        data: { magicLinkIssuedAt: null } as never,
        depth: 0,
        overrideAccess: true,
      })

      const sessionToken = await createSession(payload, collection, manager.id)

      // `generatePayloadCookie` derives the expiry from the collection's own
      // `tokenExpiration`, so it needs no `getCookieExpiration` call here.
      const cookie = generatePayloadCookie({
        collectionAuthConfig: payload.collections[collection]!.config.auth,
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
}
