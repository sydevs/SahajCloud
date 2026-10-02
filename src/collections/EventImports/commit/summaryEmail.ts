/**
 * The one notice a committed batch sends: what it added, to every admin.
 *
 * ⚠ **Written where its only consumer is.** The finish step is the sole caller,
 * so this is single-owner code and belongs beside it rather than in
 * `src/lib/notifications/` (`src/AGENTS.md`, "One consumer ⇒ it isn't shared").
 * The template stays in `src/emails/` with every other one.
 *
 * ⚠ **One send, not one per admin.** The batch is hard-deleted immediately
 * after, so a partial fan-out would leave no way to tell which admins were
 * reached. Admins already see each other in `/admin/collections/managers`, so
 * sharing the envelope discloses nothing new.
 */

import type { PayloadRequest } from 'payload'

import { createElement } from 'react'

import type { EventImportSummaryCounts } from '@/emails/EventImportSummaryEmail'
import { EventImportSummaryEmail } from '@/emails/EventImportSummaryEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import { adminUrl, adminDocUrl } from '@/lib/utilities/adminUrl'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import type { Manager } from '@/payload-types'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'

export interface ImportSummaryArgs {
  uploaderName: string
  targetId: number
  /** The target region's own name, which a manager authored. */
  targetName: string
  counts: EventImportSummaryCounts
}

/**
 * Send the summary, or say why it was not sent.
 *
 * Throws nothing: the classes exist either way, and the finish step must not
 * strand a batch over an undelivered report (`./finish`).
 */
export async function sendImportSummary(
  req: PayloadRequest,
  { uploaderName, targetId, targetName, counts }: ImportSummaryArgs,
): Promise<boolean> {
  const to = await adminAddresses(req)
  const brand = getEmailBrand('sahaj-atlas')
  const created = counts.verified + counts.unverified

  try {
    await req.payload.sendEmail({
      to,
      from: `${headerDisplayName(brand.productName)} <${MANAGER_EMAIL_FROM}>`,
      // The region's name is manager-authored free text, so a line break in it
      // would otherwise start a second header (`docs/rules/email.md`).
      subject: stripNewlines(
        `${created} ${created === 1 ? 'class' : 'classes'} imported into ${targetName}`,
      ),
      html: await renderEmail(
        createElement(EventImportSummaryEmail, {
          brand,
          uploaderName,
          targetName,
          counts,
          targetUrl: adminDocUrl('regions', targetId),
          unverifiedUrl: adminUrl(
            '/collections/events?where[verificationStage][equals]=unverified',
          ),
        }),
      ),
    })
    return true
  } catch (error) {
    req.payload.logger.error(
      { err: error, recipients: to.length },
      'Event import summary could not be sent',
    )
    return false
  }
}

/**
 * Every admin's address, or the system contact when there is none.
 *
 * ⚠ **The fallback is the point, not politeness.** An install with no reachable
 * admin would otherwise send this nowhere, and the batch it reports is deleted a
 * moment later — so the one record of a few hundred new classes would be a log
 * line. `CONTACT_EMAIL` is the repo's answer to "nobody in particular"
 * (`deliverProposal` uses the same one).
 */
async function adminAddresses(req: PayloadRequest): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: 'managers',
    where: { type: { equals: 'admin' } },
    depth: 0,
    pagination: false,
    // `email` is locked to the account holder and admins
    // (`src/collections/Managers/access.ts`), and the caller here is whichever
    // manager owns the batch.
    overrideAccess: true,
    select: { email: true },
    req,
  })

  const addresses = (docs as Manager[]).flatMap((manager) =>
    manager.email ? [manager.email] : [],
  )
  return addresses.length ? addresses : [CONTACT_EMAIL]
}
