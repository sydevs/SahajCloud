import type { LoginCollectionConfig, LoginDocument } from './types'
import type { Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { InviteEmail, inviteHeading } from '@/emails/InviteEmail'
import { stripNewlines } from '@/lib/utilities/emailSafeText'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand, renderEmail } from '@/plugins/email'

import {
  brandProject,
  type GrantSummary,
  type PendingInvitation,
  summarizeGrants,
} from './grantSummary'
import { emailFrom } from './mail'
import { INVITE_TOKEN_TTL_MS, signInviteToken } from './token'

/**
 * The invitation: what it names, how it is branded, and the link it carries.
 *
 * Two senders. The invitation queue (`invitations.ts`) sends one when a manager
 * is assigned something, naming only what is new. `issueMagicLink` re-sends one
 * to an account that has never accepted and asks for a link, naming everything
 * it holds. A create sends nothing — see `suppressCreateMail` in
 * `loginPlugin.ts`.
 *
 * ⚠ **The brand follows what the invitation lists**, not the account's
 * `currentProject` alone — see `brandProject`. An account that has never
 * signed in has no current project, so that rule alone sent every Atlas manager
 * a We Meditate invitation.
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

/** What one invitation names, and the brand chosen to match it. */
export interface PreparedInvite {
  project: ProjectSlug | undefined
  summary: GrantSummary
}

/**
 * Summarize the access an invitation names, and choose its brand from that.
 *
 * The subject, the `From` and the body all take `project` from here, so they
 * cannot disagree about which product is inviting.
 */
export async function prepareInvite({
  config,
  doc,
  only,
  payload,
  req,
}: {
  config: LoginCollectionConfig
  /** The account being invited. `id` and `type` decide what the email may claim. */
  doc: LoginDocument
  /** Name only these — what was assigned since the last invitation. */
  only?: PendingInvitation
  payload: Payload
  req?: PayloadRequest
}): Promise<PreparedInvite> {
  const summary = await summarizeGrants({
    collection: config.slug as string,
    id: doc.id,
    only,
    payload,
    req,
    type: doc.type,
  })

  return { project: brandProject(config.project?.(doc) ?? undefined, summary), summary }
}

/** Whether an invitation has anything to name. One with nothing is not sent. */
export function namesAnything({ fullAccess, grants, responsibilities }: GrantSummary): boolean {
  return fullAccess || grants.length > 0 || responsibilities.length > 0
}

export interface InviteMailArgs extends PreparedInvite {
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
}

/** Render the invitation. */
export function generateInviteEmailHTML({
  accepted,
  actionUrl,
  assignedBy,
  doc,
  project,
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
      project,
    }),
  )
}

/** The heading, as a subject. @see inviteHeading */
export function generateInviteEmailSubject({ project, summary }: PreparedInvite): string {
  return stripNewlines(inviteHeading(summary, getEmailBrand(project).productName))
}

/**
 * The whole invitation for one account, or `null` when it would name nothing —
 * everything queued was undone or has finished.
 *
 * The one composition both senders run, and what the preview script drives. An
 * account that has accepted gets a button to the admin; any other gets the
 * invitation link, whose acceptance is what lets it sign in.
 */
export async function composeInvitation({
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
}): Promise<null | { from: string; html: string; subject: string }> {
  const prepared = await prepareInvite({ config, doc, only, payload, req })
  if (!namesAnything(prepared.summary)) return null

  const accepted = doc._verified === true
  const actionUrl = accepted
    ? `${getServerUrl()}${config.redirectTo ?? '/admin'}`
    : inviteUrl(config, await signInviteFor(config, doc, payload.secret, now))

  return {
    from: emailFrom(prepared.project),
    subject: generateInviteEmailSubject(prepared),
    html: await generateInviteEmailHTML({ ...prepared, accepted, actionUrl, assignedBy, doc }),
  }
}
