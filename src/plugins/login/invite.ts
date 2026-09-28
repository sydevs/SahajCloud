import type { LoginCollectionConfig, LoginDocument } from './types'
import type { Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { InviteEmail, inviteHeading } from '@/emails/InviteEmail'
import { stripNewlines } from '@/lib/utilities/emailSafeText'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { getEmailBrand, renderEmail } from '@/plugins/email'

import { type GrantSummary, type PendingInvitation, summarizeGrants } from './grantSummary'
import { emailFrom } from './mail'
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
   * Whether the account has accepted before — then the button opens the admin
   * rather than accepting anything.
   */
  accepted: boolean
  /** The invitation link, or the admin URL for an accepted account. */
  actionUrl: string
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
  summary,
}: InviteMailArgs): Promise<string> {
  return renderEmail(
    createElement(InviteEmail, {
      name: doc.name || doc.email || '',
      accepted,
      actionUrl,
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
 * account that has accepted gets a button to the admin; any other gets an
 * invitation link in each email. The first one accepted activates the account,
 * and the rest then say so rather than "not valid" (`redeemInvite`).
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

  return Promise.all(
    summaries.filter(namesAnything).map(async (summary) => ({
      from: emailFrom(summary.project),
      subject: generateInviteEmailSubject(summary),
      html: await generateInviteEmailHTML({
        accepted,
        actionUrl: accepted
          ? `${getServerUrl()}${config.redirectTo ?? '/admin'}`
          : inviteUrl(config, await signInviteFor(config, doc, payload.secret, now)),
        assignedBy,
        doc,
        summary,
      }),
    })),
  )
}
