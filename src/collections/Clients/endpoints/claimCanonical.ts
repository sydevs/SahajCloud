import type { Endpoint } from 'payload'

import { APIError } from 'payload'
import { z } from 'zod'

import { MAX_MOUNT_KEY_LENGTH } from '@/lib/clients/embedMetadata'
import { requireActiveManager } from '@/lib/endpoints'
import type { Client } from '@/payload-types'

/** `POST /api/clients/:id/claim-canonical` response. */
interface ClaimCanonicalResponse {
  status: 'claimed' | 'already' | 'needs-region' | 'taken' | 'unknown-mount'
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
 * ⚠ **The mount must be one the widget has already reported.** Taking the
 * volunteer's typed address instead would let this endpoint designate a page
 * nobody has seen, which is the one thing the report contract exists to prevent.
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
    if (!Number.isInteger(clientId)) {
      return Response.json({ errors: [{ message: 'Invalid service id.' }] }, { status: 400 })
    }

    // `parseQuery` reads `req.query`; this one carries its argument in the body,
    // so the same envelope is produced by hand rather than by widening that
    // helper for one caller.
    let raw: unknown = null
    try {
      raw = await req.json?.()
    } catch {
      raw = null
    }
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

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
      return Response.json({ errors: [{ message: 'Service not found.' }] }, { status: 404 })
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
