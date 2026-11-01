import type { Endpoint } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { MAX_MOUNT_KEY_LENGTH } from '@/lib/clients/embedMetadata'
import { splitMountKey } from '@/lib/clients/verification'
import { errorResponse, parseBody, requireActiveManager } from '@/lib/endpoints'
import type { Client } from '@/payload-types'
import { isHostAllowed, parseAllowedDomains } from '@/plugins/usage/originEnforcement'

/** `POST /api/clients/:id/claim-canonical` response. */
interface ClaimCanonicalResponse {
  status: 'claimed' | 'already' | 'needs-region' | 'needs-domains' | 'taken' | 'unknown-mount'
  /** A sentence for the Install tab to render verbatim. */
  message: string
}

const bodySchema = z.object({
  /** The reported mount key to designate, exactly as `embedMetadata` holds it. */
  mount: z.string().min(1).max(MAX_MOUNT_KEY_LENGTH),
})

/**
 * POST /api/clients/:id/claim-canonical
 *
 * Switch canonical ownership on for a service that has just been installed,
 * naming the mount the widget reported (#1055).
 *
 * **Why this exists rather than the volunteer ticking the box.** Canonical
 * ownership is two fields and a uniqueness rule, and the person installing the
 * atlas is one non-technical volunteer per site who has never seen the SEO tab.
 * The Install tab runs this the moment a report arrives, so the common case —
 * the first site in its region — needs no decision from anyone. The uncommon
 * case needs a maintainer, and this endpoint's whole job is to tell those two
 * apart in the volunteer's own words.
 *
 * ⚠ **It designates a mount; it does not attest one.** `canonical.embed` is a
 * nomination, and only `verification.verified` — written by the CMS after it
 * loads the page itself — yields a public URL. So the worst a forged report plus
 * this endpoint can do is nominate a page that then fails verification, which is
 * the bound `docs/rules/clients.md` already describes.
 *
 * ⚠ **The mount must be one the widget has already reported, from a host the
 * service has declared.** Both halves, and the second is the one that makes
 * this safe to fire without a human.
 *
 * `docs/rules/clients.md` draws the line this feature leans on: *canonical
 * viability is automatic, canonical identity is not* — a human designates which
 * discovered mount is canonical, which "bounds tampering: a forged report can
 * assert viability only for a mount someone already chose". The Install tab
 * removes that human, so something else has to bound it. `POST
 * /api/clients/report` checks the reported host against `allowedDomains` **only
 * when that list is non-empty**, and an empty one allows any origin by
 * documented default — so for a client with none, anyone holding its key (which
 * the widget ships to every browser) can report `https://attacker.tld/classes`
 * and have it designated.
 *
 * So an unlisted host is refused here, not in the tab: the endpoint is the
 * authority, and a maintainer listing the site's domain is cheap next to handing
 * someone else every canonical URL in a region subtree. The readiness marker
 * carries no nonce, so verification would not catch it either — any host running
 * our script can hand-write the marker.
 *
 * **The uniqueness refusal is not re-implemented here.**
 * `validateCanonicalOwnership` already rejects a second enabled client on a
 * region and names the incumbent; this catches that refusal and passes its
 * words through. A second copy of the rule would be free to disagree with the
 * hook that actually enforces it.
 *
 * Gated on `requireActiveManager` **and** on the row's own access: both the read
 * and the write run `overrideAccess: false` with the caller's `req`, so the
 * document-manager path is what decides whether this manager may touch this
 * service (`docs/rules/access.md`). A manager of another client gets a 404 from
 * the read, which is also why the Install tab is unreachable for them.
 */
export const claimCanonical: Endpoint = {
  path: '/:id/claim-canonical',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const clientId = Number(req.routeParams?.id)
    if (!Number.isInteger(clientId)) return errorResponse('Invalid service id.', 400)

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response

    let client: Client
    try {
      client = await req.payload.findByID({
        collection: 'clients',
        id: clientId,
        depth: 0,
        overrideAccess: false,
        req,
      })
    } catch {
      return errorResponse('Service not found.', 404)
    }

    if (client.canonical?.enabled) {
      return answer('already', 'This service already owns its region’s canonical URLs.')
    }

    // The mount has to be one the widget reported. `embedMetadata` is written
    // only by `POST /api/clients/report`, from an allowed origin.
    const reported = client.embedMetadata as Record<string, unknown> | null | undefined
    if (!reported || typeof reported !== 'object' || !(parsed.data.mount in reported)) {
      return answer(
        'unknown-mount',
        'The atlas has not reported itself from that page yet. Nothing was changed.',
      )
    }

    // The trust boundary, before anything is written. See the docblock.
    const patterns = parseAllowedDomains(client.allowedDomains)
    const host = splitMountKey(parsed.data.mount)?.domain ?? null
    if (patterns.length === 0 || !host || !isHostAllowed(host, patterns)) {
      return answer(
        'needs-domains',
        'This service has not declared which domains belong to it, so the atlas cannot claim its web addresses yet. Ask a maintainer to add your site’s domain to the service — everything else about your install is finished.',
      )
    }

    // `validateCanonicalOwnership` refuses to enable without one, with its own
    // message — but a volunteer reading "region is required" has no idea that is
    // a maintainer's job, so this says so before the hook has to.
    if (!client.region) {
      return answer(
        'needs-region',
        'This service has no Atlas region yet, so it cannot own its canonical URLs. Ask a maintainer to set one — everything else about your install is finished.',
      )
    }

    try {
      await req.payload.update({
        collection: 'clients',
        id: clientId,
        data: {
          canonical: { ...client.canonical, enabled: true, embed: parsed.data.mount },
        },
        overrideAccess: false,
        req,
      })
    } catch (error) {
      // The uniqueness rule is the expected refusal here, and its message names
      // the incumbent service — which is exactly what a maintainer needs.
      if (error instanceof APIError) {
        return answer(
          'taken',
          `Another service already owns this region’s canonical URLs, so this one was left as it is. Ask a maintainer to sort out which should own them. (${error.message})`,
        )
      }
      throw error
    }

    return answer(
      'claimed',
      'Your site now owns the canonical web addresses for its region, so search engines will send people to your pages.',
    )
  },
}

function answer(status: ClaimCanonicalResponse['status'], message: string): Response {
  const body: ClaimCanonicalResponse = { status, message }
  return Response.json(body, { status: 200 })
}
