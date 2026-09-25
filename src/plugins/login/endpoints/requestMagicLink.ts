import type { LoginCollectionConfig } from '../types'
import type { Endpoint } from 'payload'

import { parseBody } from '@/lib/endpoints'

import { issueMagicLink, magicLinkEmailSchema } from '../magicLinks'

export const REQUEST_MAGIC_LINK_PATH = '/request-magic-link'

/** What every caller sees, whatever happened. See the handler's docblock. */
const ACCEPTED = { ok: true } as const

/**
 * `POST /api/<slug>/request-magic-link`
 *
 * Trades an email address for an emailed sign-in link, for one configured auth
 * collection. `loginPlugin` builds one of these per entry in its `collections`
 * option. The work is `issueMagicLink`, shared with the sign-in page.
 *
 * Auth: **intentionally anonymous** — an account that cannot sign in is exactly
 * who asks for a link, so no guard is possible here. It is absent from the
 * OpenAPI client spec for the same reason `set-project` is: the collections this
 * serves are admin-only and in no project, so they publish no public paths.
 *
 * ⚠ **The response is identical for every outcome** — a link sent, an address
 * nobody holds, a document `isEligible` rejects, and a repeat inside the
 * throttle window. Any difference is an account-enumeration oracle on an
 * anonymous endpoint, and the throttle is the sharpest one: a 429 would tell the
 * caller the address is real *and* recently used. The work still differs (an
 * unknown address neither writes nor sends), so this is uniform in status and
 * body rather than in elapsed time; closing the timing channel would mean paying
 * for a send that is not happening.
 */
export function requestMagicLink(config: LoginCollectionConfig): Endpoint {
  return {
    path: REQUEST_MAGIC_LINK_PATH,
    method: 'post',
    handler: async (req) => {
      const parsed = await parseBody(req, magicLinkEmailSchema)
      if (!parsed.ok) return parsed.response

      try {
        await issueMagicLink({ payload: req.payload, config, email: parsed.data.email })
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
