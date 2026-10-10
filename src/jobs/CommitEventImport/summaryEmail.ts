/**
 * The one notice a committed batch sends: what it added, to the volunteer whose
 * file it was, with every admin copied.
 *
 * ⚠ **One send, not one per recipient.** A partial fan-out would leave no way to
 * tell which admins were reached. Admins already see each other in
 * `/admin/collections/managers`, and the uploader is named in the body, so
 * sharing the envelope discloses nothing new.
 *
 * ⚠ **`cc`, which the Resend adapter had to learn.** An unmapped message field
 * is dropped in silence (`docs/rules/email.md`), so adding the recipient and
 * adding the mapping are one change.
 *
 * ⚠ **Throws nothing.** The classes exist and the report is on the batch either
 * way, and a throw here would send the commit job back for a retry that creates
 * nothing and mails again.
 */

import type { PayloadRequest } from 'payload'

import { createElement } from 'react'

import { managerRoster } from '@/collections/EventImports/commit/managers'
import { creatableNodes } from '@/collections/EventImports/commit/placement'
import { plannedMapboxId } from '@/collections/EventImports/commit/regionData'
import type { CommitRow, Uploader } from '@/collections/EventImports/commit/rows'
import { isCommittable } from '@/collections/EventImports/commit/rows'
import { commitReport, tallyRows } from '@/collections/EventImports/commit/summary'
import type { ProposedNode } from '@/collections/EventImports/propose/tree'
import { EventImportSummaryEmail } from '@/emails/EventImportSummaryEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import { adminDocUrl, adminUrl } from '@/lib/utilities/adminUrl'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import type { Manager } from '@/payload-types'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'

export interface ImportSummaryArgs {
  req: PayloadRequest
  batchId: number
  /**
   * When the batch was uploaded — the boundary a region or an account it opened
   * is counted against.
   */
  batchCreatedAt: string
  uploader: Uploader
  /** The target region's own name, which a manager authored. */
  targetName: string
  rows: readonly CommitRow[]
  nodes: readonly ProposedNode[]
}

/** Send the summary, and report whether it went. */
export async function sendImportSummary({
  req,
  batchId,
  batchCreatedAt,
  uploader,
  targetName,
  rows,
  nodes,
}: ImportSummaryArgs): Promise<boolean> {
  const brand = getEmailBrand('sahaj-atlas')
  const tally = tallyRows(rows)
  const report = commitReport(rows)
  const created = tally.verified + tally.unverified

  let to: string[] = []
  try {
    const [address, admins, regionsAdded, coordinatorsCreated] = await Promise.all([
      addressOf(req, uploader.id),
      adminAddresses(req),
      countCreatedRegions(req, batchId, nodes, batchCreatedAt),
      countCreatedCoordinators(req, rows, batchCreatedAt),
    ])

    // The uploader's own address is the point of the mail; with none — a deleted
    // or deactivated account — the admins are who is left to tell.
    const recipients = address ? [address] : admins
    const copied = address ? admins.filter((admin) => admin !== address) : []
    if (!recipients.length) return false
    to = recipients

    await req.payload.sendEmail({
      to: recipients,
      ...(copied.length ? { cc: copied } : {}),
      from: `${headerDisplayName(brand.productName)} <${MANAGER_EMAIL_FROM}>`,
      // The region's name is manager-authored free text, so a line break in it
      // would otherwise start a second header (`docs/rules/email.md`).
      subject: stripNewlines(
        `${created} ${created === 1 ? 'class' : 'classes'} imported into ${targetName}`,
      ),
      html: await renderEmail(
        createElement(EventImportSummaryEmail, {
          brand,
          uploaderName: uploader.name,
          targetName,
          counts: {
            verified: tally.verified,
            unverified: tally.unverified,
            duplicates: tally.duplicates,
            errors: tally.errors,
            regionsAdded,
            coordinators: managerRoster(
              rows.filter(isCommittable).map(({ line, values }) => ({ line, values: values ?? {} })),
            ).length,
            coordinatorsCreated,
          },
          skipped: report.skipped.map(({ line, reasons }) => ({ line, reasons })),
          batchUrl: adminDocUrl('event-imports', batchId),
          unverifiedUrl: adminUrl('/collections/events?where[verificationStage][equals]=unverified'),
        }),
      ),
    })
    return true
  } catch (error) {
    req.payload.logger.error(
      { err: error, batch: batchId, recipients: to.length },
      'Event import summary could not be sent',
    )
    return false
  }
}

/**
 * Every admin's address, or the system contact when there is none.
 *
 * ⚠ **The fallback is the point, not politeness.** An install with no reachable
 * admin would otherwise send this nowhere, so the one record of a few hundred
 * new classes would be a log line. `CONTACT_EMAIL` is the repo's answer to
 * "nobody in particular".
 */
async function adminAddresses(req: PayloadRequest): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: 'managers',
    where: { type: { equals: 'admin' } },
    depth: 0,
    pagination: false,
    // `email` is locked to the account holder and admins
    // (`src/collections/Managers/access.ts`), and this job has no user at all.
    overrideAccess: true,
    select: { email: true },
    req,
  })

  const addresses = (docs as Manager[]).flatMap((manager) => (manager.email ? [manager.email] : []))
  return addresses.length ? addresses : [CONTACT_EMAIL]
}

/** The uploader's own address, where their account can still receive one. */
async function addressOf(req: PayloadRequest, managerId: null | number): Promise<null | string> {
  if (managerId === null) return null
  const manager = (await req.payload
    .findByID({
      collection: 'managers',
      id: managerId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      select: { email: true, type: true },
      req,
    })
    .catch(() => null)) as Manager | null
  return manager && manager.type !== 'inactive' ? manager.email || null : null
}

/**
 * How many regions this batch opened.
 *
 * Asked of the database rather than counted as it went: a retried commit's own
 * `ensureProposedRegions` reports everything an earlier attempt created as
 * adopted, so a counter would under-report exactly the runs that needed a retry.
 *
 * ⚠ **`createdAt` is load-bearing, because a planned id is not always this
 * batch's.** A hand-located node's id carries the batch (`manualMapboxIdFor`),
 * but a geocoded node's planned id IS Mapbox's own feature id — which the region
 * the commit adopted has been holding since long before this upload.
 */
async function countCreatedRegions(
  req: PayloadRequest,
  batchId: number,
  nodes: readonly ProposedNode[],
  since: string,
): Promise<number> {
  let planned: string[]
  try {
    planned = creatableNodes(nodes).flatMap((node) => plannedMapboxId(node, batchId) ?? [])
  } catch {
    return 0
  }
  if (!planned.length) return 0

  const { totalDocs } = await req.payload.count({
    collection: 'regions',
    where: {
      and: [{ mapboxId: { in: planned } }, { createdAt: { greater_than_equal: since } }],
    },
    overrideAccess: true,
    req,
  })
  return totalDocs
}

/**
 * How many of the batch's coordinators got an account out of it.
 *
 * An account holding a roster address and younger than the batch is one this
 * import opened; the only way to miscount is for somebody to have added that
 * exact address by hand between the upload and the commit.
 */
async function countCreatedCoordinators(
  req: PayloadRequest,
  rows: readonly CommitRow[],
  since: string,
): Promise<number> {
  const roster = managerRoster(
    rows.filter(isCommittable).map(({ line, values }) => ({ line, values: values ?? {} })),
  )
  if (!roster.length) return 0

  const { totalDocs } = await req.payload.count({
    collection: 'managers',
    where: {
      and: [
        { email: { in: roster.map((entry) => entry.email) } },
        { createdAt: { greater_than_equal: since } },
      ],
    },
    overrideAccess: true,
    req,
  })
  return totalDocs
}
