import type { LoginCollectionConfig, LoginDocument } from './types'
import type { Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { InviteEmail, inviteHeading } from '@/emails/InviteEmail'
import { adminUrl } from '@/lib/utilities/adminUrl'
import { stripNewlines } from '@/lib/utilities/emailSafeText'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { getEmailBrand, renderEmail } from '@/plugins/email'

import { type GrantSummary, type PendingInvitation, summarizeGrants } from './grantSummary'
import { emailFrom } from './mail'
import { pageLinkUrl } from './pageLink'
import { INVITE_TOKEN_TTL_MS, signInviteToken } from './token'

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

/**
 * The address in the invitation.
 *
 * ⚠ **The page, not the endpoint**, and a distinct parameter from a sign-in
 * link's `?token=`. The page reads the token and writes nothing, so a mail
 * scanner's `GET` spends nothing; the burn sits behind that page's form.
 */
export function inviteUrl(config: LoginCollectionConfig, token: string): string {
  return `${getServerUrl()}${config.requestPagePath}?invite=${encodeURIComponent(token)}`
}

/** Mint the link an invitation carries. */
export function signInviteFor(
  config: LoginCollectionConfig,
  doc: Pick<LoginDocument, 'id'>,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  return signInviteToken(
    { collection: config.slug as string, issuedAt: now.getTime(), userId: doc.id },
    secret,
    now,
  )
}

/** Whether an invitation has anything to name. One with nothing is not sent. */
export function namesAnything({ fullAccess, grants, responsibilities }: GrantSummary): boolean {
  return fullAccess || grants.length > 0 || responsibilities.length > 0
}

export interface InviteMailArgs {
  /**
   * Whether the account has confirmed its email before — then the button opens
   * its notification settings rather than confirming anything.
   */
  accepted: boolean
  /** The invitation link, or an accepted account's notification settings. */
  actionUrl: string
  /** Whether it names only what is new, rather than everything held. */
  listsOnlyNew: boolean
  /** Who assigned it, when a person did. */
  assignedBy?: string
  doc: LoginDocument
  /** One project's part — the whole content of this email. */
  summary: GrantSummary
}

/** Render one project's invitation. */
export function generateInviteEmailHTML({
  accepted,
  actionUrl,
  assignedBy,
  doc,
  listsOnlyNew,
  summary,
}: InviteMailArgs): Promise<string> {
  return renderEmail(
    createElement(InviteEmail, {
      name: doc.name || doc.email || '',
      accepted,
      actionUrl,
      listsOnlyNew,
      validFor: INVITE_VALID_FOR,
      assignedBy,
      fullAccess: summary.fullAccess,
      grants: summary.grants,
      responsibilities: summary.responsibilities,
      project: summary.project,
    }),
  )
}

/** The heading, as a subject. @see inviteHeading */
export function generateInviteEmailSubject(summary: GrantSummary): string {
  return stripNewlines(inviteHeading(summary, getEmailBrand(summary.project).productName))
}

/**
 * Every invitation for one account — one per project it names, or none when
 * everything queued was undone or has finished.
 *
 * The one composition both senders run, and what the preview script drives. An
 * account that has never confirmed its email gets an invitation link in each
 * email; the first one used activates the account, and the rest then say so
 * rather than "not valid" (`redeemInvite`). An account that has gets
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
  const actionUrl = accepted
    ? await pageLinkUrl(
        config,
        doc,
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
      subject: generateInviteEmailSubject(summary),
      html: await generateInviteEmailHTML({
        accepted,
        actionUrl:
          actionUrl ?? inviteUrl(config, await signInviteFor(config, doc, payload.secret, now)),
        assignedBy,
        doc,
        // The queue names what was queued; a resend names everything held.
        listsOnlyNew: only !== undefined,
        summary,
      }),
    })),
  )
}
