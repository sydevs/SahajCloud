import type { ImportRun } from './run'
import type { PayloadRequest } from 'payload'

import { createElement } from 'react'

import { EventImportSummaryEmail } from '@/emails/EventImportSummaryEmail'
import { adminDocUrl } from '@/lib/utilities/adminUrl'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import type { Manager } from '@/payload-types'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'

/** One "ready to review" email to the uploader, in counts. A failure is logged, never thrown. */
export async function sendImportSummary(args: {
  req: PayloadRequest
  run: ImportRun
}): Promise<boolean> {
  const { req, run } = args
  try {
    const to = await uploaderAddress(req, run.managerId)
    if (!to) return false
    const brand = getEmailBrand('sahaj-atlas')
    const { imported } = run
    const duplicates = run.skipped.filter(({ duplicateOf }) => duplicateOf).length
    await req.payload.sendEmail({
      to,
      from: `${headerDisplayName(brand.productName)} <${MANAGER_EMAIL_FROM}>`,
      subject: stripNewlines(
        imported
          ? `${imported} ${imported === 1 ? 'class' : 'classes'} ready to review in ${run.target.name}`
          : `No classes were created from your import into ${run.target.name}`,
      ),
      html: await renderEmail(
        createElement(EventImportSummaryEmail, {
          brand,
          targetName: run.target.name,
          created: imported,
          duplicates,
          errors: run.skipped.length - duplicates,
          importUrl: adminDocUrl('imports', run.importId),
        }),
      ),
    })
    return true
  } catch (error) {
    req.payload.logger.error(
      { err: error, import: run.importId },
      'Class import summary could not be sent',
    )
    return false
  }
}

async function uploaderAddress(
  req: PayloadRequest,
  managerId: null | number,
): Promise<null | string> {
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
