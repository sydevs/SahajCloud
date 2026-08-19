import type { Endpoint } from 'payload'

import { nextVerificationState } from '@/lib/clients/verification'
import { verifyEmbed } from '@/lib/embedVerification/verifyEmbed'
import { requireActiveManager } from '@/lib/endpoints'
import type { Client } from '@/payload-types'

/** `POST /api/clients/:id/verify-embed` response. */
interface VerifyEmbedResponse {
  status: 'verified' | 'failed' | 'inconclusive'
  reason?: string
  /** Human sentence for the admin panel to render verbatim. */
  message: string
}

const MESSAGES: Record<VerifyEmbedResponse['status'], (reason?: string) => string> = {
  verified: () => 'Verified — the widget is live on that page.',
  failed: (reason) =>
    reason === 'marker-absent'
      ? 'The page loaded but the widget was not running on it.'
      : 'That page could not be reached.',
  inconclusive: (reason) =>
    reason === 'not-configured'
      ? 'Verification is not configured on this environment.'
      : 'Could not check right now — nothing was changed. Try again shortly.',
}

/**
 * POST /api/clients/:id/verify-embed
 *
 * Run the embed verification for one service on demand, so an operator setting a service up is not
 * waiting for the nightly job to find out whether their choice works. Manager-authenticated: this
 * triggers an outbound page render, so it is not part of the public client surface.
 *
 * Shares `verifyEmbed` and `nextVerificationState` with the job, so a button press and a scheduled
 * run fold into the stored state identically — including the rule that an `inconclusive` result
 * changes nothing. **This endpoint never disables canonical ownership**, though: three strikes is a
 * judgement about a pattern over days, and one impatient click should not be able to reach it.
 */
export const verifyEmbedOnDemand: Endpoint = {
  path: '/:id/verify-embed',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const clientId = Number(req.routeParams?.id)
    if (!Number.isInteger(clientId)) {
      return Response.json({ errors: [{ message: 'Invalid service id.' }] }, { status: 400 })
    }

    let client: Client
    try {
      client = await req.payload.findByID({
        collection: 'clients',
        id: clientId,
        depth: 0,
        overrideAccess: true,
      })
    } catch {
      return Response.json({ errors: [{ message: 'Service not found.' }] }, { status: 404 })
    }

    const mount = client.canonical?.embed
    if (!mount) {
      return Response.json(
        { errors: [{ message: 'No canonical embed is selected for this service.' }] },
        { status: 400 },
      )
    }

    const result = await verifyEmbed(mount)
    const transition = nextVerificationState({
      current: client.canonical?.verification ?? null,
      result,
      now: new Date(),
    })

    await req.payload.update({
      collection: 'clients',
      id: clientId,
      // `disable` is deliberately ignored here — see the note above.
      data: {
        canonical: {
          ...client.canonical,
          verification: transition.verification,
          nextVerifyAt: transition.nextVerifyAt,
        },
      },
      overrideAccess: true,
    })

    const reason = result.status === 'verified' ? undefined : result.reason
    const body: VerifyEmbedResponse = {
      status: result.status,
      ...(reason ? { reason } : {}),
      message: MESSAGES[result.status](reason),
    }
    return Response.json(body, { status: 200 })
  },
}
