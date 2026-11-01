import type { SeoAuditDeps } from './seoChecks'
import type { Payload, PayloadRequest } from 'payload'

import { parseAtlasRoute } from '@/endpoints/atlas/seo/atlasRoute'
import { resolveAtlasSeo } from '@/endpoints/atlas/seo/resolve'
import { resolveAtlasSitemap } from '@/endpoints/atlas/sitemap/resolve'
import type { RoutingMode } from '@/lib/clients/canonical'
import type { SeoCheckResult, VerifiedEmbed } from '@/lib/clients/verification'
import { DEFAULT_LOCALE, isValidLocale } from '@/lib/locales'

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
 * ⚠ **The request is forwarded with `overrideAccess: false` kept at the
 * resolvers' own default**, so the client's published-only view is what is
 * compared — the same document a crawler would be served. Checking against
 * unpublished content would report a page as wrong on the day it is correct.
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
        return target ? resolveAtlasSeo({ req, target, locale, clientId }) : null
      },
      resolveSitemap: async () => (await resolveAtlasSitemap({ req, clientId })).urls,
    },
  })
}

/**
 * Tell the service's manager that one of its pages stopped publishing our
 * metadata.
 *
 * ⚠ **One mail for the whole run, listing every new failure**, rather than one
 * per failure: a router that stops answering fails four checks on two pages at
 * once, and eight emails for one cause is how a volunteer learns to filter us
 * out. `nextSeoCheckState` is what decides which failures are new.
 *
 * ⚠ **A failed send never fails the run.** The checks are a warning channel, so
 * losing the warning is worse than losing nothing — but it must not cost the
 * stored snapshot, which is what the Install tab reads.
 */
export async function notifySeoFailures(args: {
  payload: Payload
  clientName: string
  contactEmail: string
  failures: readonly SeoCheckResult[]
  /** Where the manager goes to see the failing step. */
  installUrl: string
}): Promise<void> {
  const { payload, clientName, contactEmail, failures, installUrl } = args
  if (failures.length === 0) return

  const rows = failures
    .map(
      (failure) =>
        `<li><strong>${escape(failure.route)}</strong> — ${escape(CHECK_LABELS[failure.check])}` +
        (failure.detail ? `: ${escape(failure.detail)}` : '') +
        `</li>`,
    )
    .join('')

  try {
    await payload.sendEmail({
      to: contactEmail,
      subject: `Search engines may not be reading ${clientName}’s atlas pages`,
      html:
        `<p>The Sahaj Atlas is still showing on <strong>${escape(clientName)}</strong>’s site, ` +
        `so nobody visiting it is affected. But what a search engine reads is now missing ` +
        `something:</p><ul>${rows}</ul>` +
        `<p>Each line names what we expected and what the page says. Open the ` +
        `<a href="${escape(installUrl)}">Install tab</a> to see which setup step to redo — ` +
        `the check next to that step will say the same thing.</p>` +
        `<p>You will not get this email again for the same problem.</p>`,
    })
  } catch (error) {
    payload.logger.error({
      msg: 'seoChecks: could not notify about new SEO check failures',
      clientName,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** What each check is called in an email and in the Install tab. */
export const CHECK_LABELS: Record<SeoCheckResult['check'], string> = {
  title: 'the page title',
  canonical: 'the canonical link',
  'json-ld': 'the structured-data block',
  body: 'the text a search engine reads',
  sitemap: 'the page’s sitemap entry',
}

/** Minimal escaping for the one email this module sends. */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
