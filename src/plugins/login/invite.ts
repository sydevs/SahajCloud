import type { LoginCollectionConfig, LoginDocument } from './types'
import type { Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { InviteEmail, inviteHeading } from '@/emails/InviteEmail'
import { adminUrl } from '@/lib/utilities/adminUrl'
import { stripNewlines } from '@/lib/utilities/emailSafeText'
import { getEmailBrand, renderEmail } from '@/plugins/email'

import { type GrantSummary, type PendingInvitation, summarizeGrants } from './grantSummary'
import { inviteLinkUrl, pageLinkUrl } from './links'
import { emailFrom } from './mail'
import { INVITE_TOKEN_TTL_MS } from './token'

/**
 * The invitation: what it names, how it is branded, and the link it carries.
 *
 * Two senders. The invitation queue (`invitations.ts`) sends when a manager is
 * assigned something, naming only what is new. `issueMagicLink` re-sends to an
 * account that has never accepted and asks for a link, naming everything it
 * holds. A create sends nothing — see `suppressCreateMail` in `loginPlugin.ts`.
 *
 * ⚠ **One email per project.** Each is branded for, and names only, its own
 * project's part (`summarizeGrants`). An account that has never signed in has
 * no current project to brand by, and one email for two products would have to
 * wear one product's name over the other's content.
 */

/** How long an invitation lasts, as the recipient is told. Derived from the TTL. */
export const INVITE_VALID_FOR = `${INVITE_TOKEN_TTL_MS / 86_400_000} days`

/** Whether an invitation has anything to name. One with nothing is not sent. */
const namesAnything = ({ fullAccess, grants, responsibilities }: GrantSummary): boolean =>
  fullAccess || grants.length > 0 || responsibilities.length > 0

/**
 * Every invitation for one account — one per project it names, or none when
 * everything queued was undone or has finished.
 *
 * The one composition both senders run, and what the preview script drives. An
 * account that has never confirmed its email gets an invitation link in each
 * email; the first one used activates the account, and the rest then say so
 * rather than "not valid" (`endpoints/redeem.ts`). An account that has gets
 * "Configure notifications" instead — a page link that signs it in on the way
 * to its own account page, opened on the collection's `notificationsTab`.
 */
export async function composeInvitations({
  assignedBy,
  config,
  doc,
  now = new Date(),
  only,
  payload,
  req,
}: {
  assignedBy?: string
  config: LoginCollectionConfig
  doc: LoginDocument
  now?: Date
  only?: PendingInvitation
  payload: Payload
  req?: PayloadRequest
}): Promise<{ from: string; html: string; subject: string }[]> {
  const summaries = await summarizeGrants({
    collection: config.slug as string,
    current: config.project?.(doc) ?? undefined,
    id: doc.id,
    only,
    payload,
    req,
    type: doc.type,
  })
  const accepted = doc._verified === true
  const settingsUrl = accepted
    ? await pageLinkUrl(
        config,
        doc.id,
        {
          label: 'your notification settings',
          tab: config.notificationsTab,
          to: new URL(adminUrl('/account')).pathname,
        },
        payload.secret,
        now,
      )
    : null

  return Promise.all(
    summaries.filter(namesAnything).map(async (summary) => ({
      from: emailFrom(summary.project),
      subject: stripNewlines(inviteHeading(summary, getEmailBrand(summary.project).productName)),
      html: await renderEmail(
        createElement(InviteEmail, {
          name: doc.name || doc.email || '',
          accepted,
          actionUrl: settingsUrl ?? (await inviteLinkUrl(config, doc.id, payload.secret, now)),
          // The queue names what was queued; a resend names everything held.
          listsOnlyNew: only !== undefined,
          validFor: INVITE_VALID_FOR,
          assignedBy,
          fullAccess: summary.fullAccess,
          grants: summary.grants,
          responsibilities: summary.responsibilities,
          project: summary.project,
        }),
      ),
    })),
  )
}
