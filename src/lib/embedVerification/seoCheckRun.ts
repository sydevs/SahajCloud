import type { SeoAuditDeps } from './seoChecks'
import type { Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { AtlasSeoWarningEmail } from '@/emails/AtlasSeoWarningEmail'
import { parseAtlasRoute } from '@/endpoints/atlas/seo/atlasRoute'
import { resolveAtlasSeo } from '@/endpoints/atlas/seo/resolve'
import { resolveAtlasSitemap } from '@/endpoints/atlas/sitemap/resolve'
import type { RoutingMode } from '@/lib/clients/canonical'
import type { SeoCheckResult, VerifiedEmbed } from '@/lib/clients/verification'
import { DEFAULT_LOCALE, isValidLocale } from '@/lib/locales'
import { adminDocUrl } from '@/lib/utilities/adminUrl'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'

import { runSeoChecks } from './seoChecks'

/**
 * The one place the SEO checks are wired to this service's own resolvers, and
 * the one place a new failure becomes an email (#1055).
 *
 * **Why it is a module and not two copies.** `POST /api/clients/:id/verify-embed`
 * and the `VerifyEmbeds` job both run these checks, and both have to resolve the
 * expectations **as the client being checked** rather than as themselves — the
 * atlas root is the one route whose answer depends on who asked (#739), so a
 * manager pressing the button and a job running as nobody would otherwise
 * compare the page against two different documents.
 *
 * Shaped like `verifyEmbed`/`probeForOutcome` beside it: the pure fold lives in
 * `@/lib/clients/verification`, the observation in `./seoChecks`, and this is
 * the seam that gives the second one a database.
 */

/**
 * Resolve and run, as one client, in one locale.
 *
 * ⚠ **The resolvers are driven on a request authenticated as the client being
 * checked, not as whoever started the run.** Both of them read with
 * `overrideAccess: false`, which is deliberate — the comparison has to be
 * against the client's own published-only view, since that is what a crawler
 * was served. But the caller here is a manager pressing Verify or a job running
 * as nobody, and neither of those reaches a `clients` read at all: the job's
 * `Forbidden` is what `tests/int/client-canonical.int.spec.ts` catches.
 *
 * So the client's own row is loaded and put on a **copy** of the request.
 * `context` still travels by reference, so the region-tree and locale memos are
 * shared with the caller rather than paid for twice, and nothing repoints the
 * caller's own request — the hazard `localeIsolatedReq` exists for.
 *
 * Switching to `overrideAccess: true` instead would compare the page against
 * unpublished content, and report a correct page as wrong on the day it is
 * correct.
 */
export async function runSeoChecksForClient(args: {
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
  // ⚠ **No headers.** Spreading the caller's request carried the admin panel's
  // own `Origin` through, and `assertClientOriginAllowed` fires for any request
  // whose user is a `clients` row — so for every client with a domain
  // (i.e. every correctly configured one) the forwarded reads
  // threw 403, and the throw escaped before the verification write, losing it.
  // The nightly job never saw it: with no headers at all the origin rule stands
  // down, which is also what makes an empty set the honest shape here. These
  // reads *are* server-to-server, and the API key was never the gate for them.
  const auditReq = {
    ...req,
    headers: new Headers(),
    user: { ...client, collection: 'clients' },
  } as unknown as PayloadRequest

  // `Clients.language` is a bare ISO 639-1 subtag, not one of the nineteen
  // locales, so it is matched against them rather than cast to one. A service
  // whose language is not a CMS locale is checked in English, which is what its
  // pages fall back to.
  const locale = language && isValidLocale(language) ? language : DEFAULT_LOCALE

  return runSeoChecks({
    verified,
    routing,
    deps,
    resolvers: {
      resolveSeo: async (route) => {
        const target = parseAtlasRoute(route)
        return target ? resolveAtlasSeo({ req: auditReq, target, locale, clientId }) : null
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
 * twice.** The on-demand endpoint and the nightly job both need this notice,
 * and each had its own copy — resolve the contact, read the manager, build the
 * URL, send, log. Both docblocks promised the two paths could not diverge, and
 * that promise was held by two copies in different owners' folders whose id
 * extraction already differed in shape. This takes the client row and answers
 * all of it.
 *
 * ⚠ **One mail for the whole run, listing every new failure**, rather than one
 * per failure: a router that stops answering fails four checks on two pages at
 * once, and eight emails for one cause is how a volunteer learns to filter us
 * out. `nextSeoCheckState` decides which failures are new.
 *
 * ⚠ **A failed send never fails the run.** The checks are a warning channel, so
 * losing the warning is worse than losing nothing — but it must not cost the
 * stored snapshot, which the Install tab reads.
 */
export async function notifySeoFailures(args: {
  payload: Payload
  /** The service, as any read of it leaves the two contact fields. */
  client: Pick<Client, 'id' | 'name' | 'managers' | 'primaryContact'>
  failures: readonly SeoCheckResult[]
}): Promise<void> {
  const { payload, client, failures } = args
  if (failures.length === 0) return

  // The primary contact, falling back to the first listed manager — the same
  // rule `VerifyEmbeds` uses for a disabled canonical. `relationId` rather than
  // a `typeof` chain, and `!== null` rather than `.find(Boolean)`, which would
  // drop a legitimate id of 0.
  const contactId =
    relationId(client.primaryContact) ??
    (client.managers ?? []).map((manager) => relationId(manager)).find((id) => id !== null)
  // A service with no contact is not an error: the tab still shows every
  // failure to whoever opens it.
  if (contactId == null) return

  try {
    const manager = await payload.findByID({
      collection: 'managers',
      id: contactId,
      depth: 0,
      overrideAccess: true,
    })
    if (!manager?.email) return

    const brand = getEmailBrand('sahaj-atlas')
    await payload.sendEmail({
      to: manager.email,
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
    })
  } catch (error) {
    payload.logger.error({
      msg: 'seoChecks: could not notify about new SEO check failures',
      clientId: client.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
