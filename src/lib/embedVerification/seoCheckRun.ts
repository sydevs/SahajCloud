import type { SeoAuditDeps } from './seoChecks'
import type { Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { AtlasSeoWarningEmail } from '@/emails/AtlasSeoWarningEmail'
import { parseAtlasRoute } from '@/endpoints/atlas/seo/atlasRoute'
import { resolveAtlasSeo } from '@/endpoints/atlas/seo/resolve'
import { resolveAtlasSitemap } from '@/endpoints/atlas/sitemap/resolve'
import type { RoutingMode } from '@/lib/clients/canonical'
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
import { adminDocUrl } from '@/lib/utilities/adminUrl'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'

import { runSeoChecks } from './seoChecks'
import { probeForOutcome } from './verifyEmbed'

/**
 * The verification pass the `VerifyEmbeds` job and `POST
 * /api/clients/:id/verify-embed` share, and the one place an SEO failure
 * becomes an email (#1055). The pure folds live in `@/lib/clients/verification`,
 * the observations in `./verifyEmbed` and `./seoChecks`.
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
  routing: RoutingMode
  /** The service's own language, from `Clients.language`. */
  language?: string | null
  deps?: SeoAuditDeps
}): Promise<SeoCheckResult[]> {
  const { req, clientId, verified, routing, language, deps } = args

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
  const auditReq = {
    ...req,
    headers: new Headers(),
    user: { ...client, collection: 'clients' },
  } as unknown as PayloadRequest

  // `Clients.language` is a bare ISO 639-1 subtag, so it is matched against the
  // locales the way the Wix route matches it: `pt` is checked in `pt-BR`, and
  // a language with no locale in English, what its pages fall back to.
  const locale = localeForLanguage(language)

  return runSeoChecks({
    verified,
    routing,
    deps,
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
 * Tell the service's manager that one of its pages stopped publishing our
 * metadata.
 *
 * ⚠ **One seam, because the recipient rule and the install URL were written
 * twice.**
 *
 * ⚠ **One mail for the whole run, listing every new failure**: a router that
 * stops answering fails four checks on two pages at once, and eight emails for
 * one cause is how a volunteer learns to filter us out.
 *
 * ⚠ **A failed send never fails the run**: it must not cost the stored
 * snapshot, which the Install tab reads.
 */
async function notifySeoFailures(args: {
  payload: Payload
  client: Pick<Client, 'id' | 'name' | 'managers' | 'primaryContact'>
  failures: readonly SeoCheckResult[]
}): Promise<void> {
  const { payload, client, failures } = args
  if (failures.length === 0) return

  await notifyServiceContact({
    payload,
    client,
    failure: 'seoChecks: could not notify about new SEO check failures',
    message: async () => {
      const brand = getEmailBrand('sahaj-atlas')
      return {
        from: `${headerDisplayName(brand.productName)} <${MANAGER_EMAIL_FROM}>`,
        subject: stripNewlines(`Search engines may not be reading ${client.name}’s atlas pages`),
        html: await renderEmail(
          createElement(AtlasSeoWarningEmail, {
            brand,
            siteName: client.name,
            failures,
            // `adminDocUrl` plus the view's own path, so the admin route stays
            // Payload's to change.
            installUrl: `${adminDocUrl('clients', client.id)}/install`,
          }),
        ),
      }
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
 * each caller, as does the SEO gate: `runSeo` is asked only once the record
 * holds a verified snapshot.
 */
export async function verifyMount(args: {
  req: PayloadRequest
  client: Pick<Client, 'id' | 'name' | 'managers' | 'primaryContact' | 'language'>
  current: CanonicalVerification | null
  mount: string
  now: Date
  verify: (mount: string) => Promise<VerificationResult>
  probe: (mount: string) => Promise<RoutingProbeResult>
  runSeo: (outcome: VerificationResult) => boolean
}) {
  const { req, client, current, mount, now, verify, probe, runSeo } = args

  const outcome = await verify(mount)
  const transition = nextVerificationState({ current, result: outcome, now })

  // The routing verdict folds into the same object, so one owner is still one
  // write. It never touches `failureCount`, and so can never reach `disable`.
  const probeResult = await probeForOutcome(mount, outcome, probe)
  const probed = nextRoutingProbeState({
    current: transition.verification,
    result: probeResult,
    now,
  })

  if (!probed.verified || !runSeo(outcome)) {
    return { outcome, transition, probeResult, verification: probed, seo: [], newFailures: [] }
  }

  const seo = await runSeoChecksForClient({
    req,
    clientId: client.id,
    verified: probed.verified,
    routing: probed.routingProbe?.verdict ?? 'query',
    language: client.language,
  })
  const { verification, newFailures } = nextSeoCheckState({ current: probed, results: seo, now })
  await notifySeoFailures({ payload: req.payload, client, failures: newFailures })
  return { outcome, transition, probeResult, verification, seo, newFailures }
}
