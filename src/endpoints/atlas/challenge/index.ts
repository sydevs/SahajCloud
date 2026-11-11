import type { ChallengeConfig } from './challengeDocument'
import type { Endpoint } from 'payload'

import { serverEnv } from '@/lib/env/server'
import { isProductionDeployment } from '@/plugins/storage/previewIsolation'

import { challengeParentAllowlist } from './allowlist'
import { challengeDocument } from './challengeDocument'
import { isParentAllowed, isTestSiteKey, readChallengeRequest } from './challengeRequest'

function respond(config: ChallengeConfig, status: number): Response {
  return new Response(challengeDocument(config), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A refusal is never cached, so a domain an operator has just added works on the next
      // load. A rendered page is the visitor's own (it names their parent), so private only.
      'Cache-Control': status === 200 ? 'private, max-age=300' : 'no-store',
      // `api.js` and Turnstile's own frame then learn this page's origin, never its query.
      'Referrer-Policy': 'strict-origin',
      'X-Robots-Tag': 'noindex',
    },
  })
}

/**
 * GET /api/atlas/challenge?parent=<origin>&theme=<light|dark|auto>&language=<code>[&probe=1]
 *
 * The Turnstile challenge the Atlas widget frames (sydevs/SahajCloud#1072, sydevs/SahajAtlasWeb#343).
 * Turnstile checks the hostname of the document that renders it, so serving it here means one
 * hostname, this deployment's, covers every partner page — and this deployment holds both halves
 * of the Turnstile credential.
 *
 * **Only an allowed parent gets a challenge.** `parent` must be an origin whose host is in some
 * active client's `site.domain`, a first-party frontend, or loopback (`challengeRequest.ts`),
 * and the page posts every message to exactly that origin (`challengeDocument.ts`). The browser
 * then refuses to deliver a token to any other parent, whatever the frame URL claims.
 *
 * ⚠ **Why not `frame-ancestors`, which the ticket first proposed.** Three reasons, each sufficient:
 * - `next.config.mjs` sets `Content-Security-Policy` on `/:path*`, and Next drops a route's own
 *   header of that name when config already set one (`next/dist/server/send-response.js`), so the
 *   directive would never have been sent.
 * - It checks every ancestor. An iframe embed puts the widget on the Atlas origin inside a partner
 *   page that no list names, and the token only ever reaches the immediate parent — which is what
 *   this pins.
 * - A refused frame is silent to its parent, so the widget could fail only at its handshake
 *   timeout. This page posts its refusal at once instead.
 *
 * ⚠ **Anonymous by necessity, so no `requireActiveClient`.** A frame navigation carries no
 * `Authorization` header, and the page reads nothing a client owns. For the same reason it is not
 * metered and not in the OpenAPI shim: it is a document the widget frames, not an API.
 */
export const atlasChallenge: Endpoint = {
  path: '/atlas/challenge',
  method: 'get',
  handler: async (req) => {
    const request = readChallengeRequest(req.query ?? {})
    const siteKey = serverEnv.TURNSTILE_SITE_KEY

    if (!siteKey) {
      req.payload.logger.error({ msg: 'atlasChallenge: TURNSTILE_SITE_KEY is not set' })
      return respond({ refusal: 'unavailable' }, 503)
    }
    if (isProductionDeployment() && isTestSiteKey(siteKey)) {
      req.payload.logger.error({ msg: 'atlasChallenge: production carries a Turnstile TEST key' })
      return respond({ refusal: 'unavailable' }, 503)
    }
    if (request.parent === null) return respond({ refusal: 'origin' }, 403)

    let patterns: string[]
    try {
      patterns = await challengeParentAllowlist(req.payload)
    } catch (error) {
      req.payload.logger.error({
        msg: 'atlasChallenge: could not read the client allowlist',
        error: error instanceof Error ? error.message : String(error),
      })
      return respond({ refusal: 'unavailable' }, 503)
    }

    if (!isParentAllowed(request.parent, patterns)) return respond({ refusal: 'origin' }, 403)

    return respond({ ...request, parent: request.parent, siteKey }, 200)
  },
}
