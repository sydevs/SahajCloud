import type { Payload, PayloadRequest } from 'payload'

import { parseAtlasRoute } from '@/endpoints/atlas/seo/atlasRoute'
import { resolveAtlasSeo } from '@/endpoints/atlas/seo/resolve'
import { resolveAtlasSitemap } from '@/endpoints/atlas/sitemap/resolve'
import { hasSearchListings, isPrimaryPage } from '@/lib/clients/site'
import type {
  CanonicalVerification,
  RoutingProbeResult,
  SeoCheckResult,
  VerificationResult,
  VerifiedEmbed,
} from '@/lib/clients/verification'
import {
  nextRoutingProbeState,
  nextSeoCheckState,
  nextVerificationState,
} from '@/lib/clients/verification'
import { localeForLanguage } from '@/lib/locales'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

import { runSeoChecks } from './seoChecks'
import { probeForOutcome } from './verifyEmbed'

/**
 * The verification pass the `VerifyEmbeds` job and `POST
 * /api/clients/:id/verify-embed` share (#1055). The pure folds live in
 * `@/lib/clients/verification`, the observations in `./verifyEmbed` and
 * `./seoChecks`.
 *
 * ⚠ **An SEO failure sends no mail.** The stored snapshot is the record, and the
 * open-items digest reads it: a service's managers see it under "Your websites",
 * an admin in their own list (`@/lib/atlasOverview/openItems`).
 */

/**
 * Resolve and run the SEO checks, as one client, in one locale.
 *
 * ⚠ **The resolvers are driven on a request authenticated as the client being
 * checked, not as whoever started the run.** The atlas root's answer depends on
 * who asked (#739), and the reads are `overrideAccess: false` on purpose — the
 * page is compared against the client's published-only view, which is what a
 * crawler was served. A manager or a job running as nobody reaches no `clients`
 * read at all (`tests/int/client-canonical.int.spec.ts`).
 *
 * The client goes on a **copy** of the request, so nothing repoints the
 * caller's own, while `context` — and its region-tree and locale memos — is
 * still shared by reference.
 */
async function runSeoChecksForClient(args: {
  req: PayloadRequest
  clientId: number
  verified: VerifiedEmbed
  /** The service's own language, from `Clients.language`. */
  language?: string | null
}): Promise<SeoCheckResult[]> {
  const { req, clientId, verified, language } = args

  const client = await req.payload.findByID({
    collection: 'clients',
    id: clientId,
    depth: 0,
    overrideAccess: true,
  })
  // ⚠ **No headers.** The admin panel's own `Origin` would reach
  // `assertClientOriginAllowed`, which fires for any `clients` user, so every
  // correctly configured client's reads threw 403 before the verification write.
  // These reads *are* server-to-server, and with no headers the rule stands down.
  //
  // A context of its own, too: the job runs many services on one `req`, and its
  // own writes change the ownership a shared memo would still be holding.
  const auditReq = {
    ...req,
    context: {},
    headers: new Headers(),
    user: { ...client, collection: 'clients' },
  } as unknown as PayloadRequest

  // `Clients.language` is a bare ISO 639-1 subtag, so it is matched against the
  // locales the way the Wix route matches it: `pt` is checked in `pt-BR`, and
  // a language with no locale in English, what its pages fall back to.
  const locale = localeForLanguage(language)

  return runSeoChecks({
    verified,
    resolvers: {
      resolveSeo: async (route) => {
        const target = parseAtlasRoute(route)
        return target ? resolveAtlasSeo({ req: auditReq, target, locale }) : null
      },
      resolveSitemap: async () => (await resolveAtlasSitemap({ req: auditReq, clientId })).urls,
    },
  })
}

/**
 * Mail a service's primary contact, falling back to its first listed manager.
 * A service with no contact is not an error.
 *
 * ⚠ **A failed send never throws**: losing the mail must not cost the state
 * change it reports.
 */
export async function notifyServiceContact(args: {
  payload: Payload
  client: Pick<Client, 'id' | 'managers' | 'primaryContact'>
  /** Logged, with the client id, when the send fails. */
  failure: string
  message: () => Promise<Omit<Parameters<Payload['sendEmail']>[0], 'to'>>
}): Promise<void> {
  const { payload, client, failure, message } = args
  // `!== null` rather than `.find(Boolean)`, which would drop a legitimate id of 0.
  const contactId =
    relationId(client.primaryContact) ??
    (client.managers ?? []).map((manager) => relationId(manager)).find((id) => id !== null)
  if (contactId == null) return

  try {
    const manager = await payload.findByID({
      collection: 'managers',
      id: contactId,
      depth: 0,
      overrideAccess: true,
    })
    if (!manager?.email) return
    await payload.sendEmail({ to: manager.email, ...(await message()) })
  } catch (error) {
    payload.logger.error({
      msg: failure,
      clientId: client.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Verify one mount, probe its routing, and run the SEO checks, folded into one
 * verification object, so a button press and a scheduled run spend the same
 * renders and fold identically. Persistence, counters and `disable` stay with
 * each caller.
 *
 * The SEO checks run beside the probe, which they do not depend on, and only
 * where they can say something: `runSeo` passes, the track can have search
 * listings, and the verified snapshot is still the service's current page.
 * ⚠ **A throw there keeps the previous snapshot** rather than costing the
 * verification write — the checks read a stranger's page.
 */
export async function verifyMount(args: {
  req: PayloadRequest
  client: Pick<Client, 'id' | 'language' | 'site'>
  current: CanonicalVerification | null
  mount: string
  now: Date
  verify: (mount: string) => Promise<VerificationResult>
  probe: (mount: string) => Promise<RoutingProbeResult>
  runSeo: (outcome: VerificationResult) => boolean
  /** `false` for a press of Check, whose failure is no strike (`nextVerificationState`). */
  countsStrikes: boolean
}) {
  const { req, client, current, mount, now, verify, probe, runSeo, countsStrikes } = args

  const outcome = await verify(mount)
  const transition = nextVerificationState({ current, result: outcome, now, countsStrikes })
  const verified = transition.verification.verified

  const checkSeo =
    verified &&
    runSeo(outcome) &&
    hasSearchListings(client.site?.track) &&
    isPrimaryPage(client.site, verified.domain, verified.mount)

  const [probeResult, seo] = await Promise.all([
    probeForOutcome(mount, outcome, probe),
    checkSeo
      ? runSeoChecksForClient({
          req,
          clientId: client.id,
          verified,
          language: client.language,
        }).catch((error: unknown) => {
          req.payload.logger.error({
            msg: 'verifyMount: the SEO checks failed; keeping the previous snapshot',
            clientId: client.id,
            error: error instanceof Error ? error.message : String(error),
          })
          return null
        })
      : null,
  ])

  // The routing verdict folds into the same object, so one owner is still one
  // write. It never touches `failureCount`, and so can never reach `disable`.
  const probed = nextRoutingProbeState({
    current: transition.verification,
    result: probeResult,
    now,
  })

  if (!seo) {
    return { outcome, transition, probeResult, verification: probed, seo: [], newFailures: [] }
  }
  const { verification, newFailures } = nextSeoCheckState({ current: probed, results: seo, now })
  return { outcome, transition, probeResult, verification, seo, newFailures }
}
