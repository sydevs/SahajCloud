import type { LoginCollectionConfig, LoginDocument } from './types'
import type { IncomingAuthType, Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { InviteEmail } from '@/emails/InviteEmail'
import { stripNewlines } from '@/lib/utilities/emailSafeText'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand, renderEmail } from '@/plugins/email'

import { brandProject, type GrantSummary, summarizeGrants } from './grantSummary'
import { INVITE_TOKEN_TTL_MS, signInviteToken } from './token'

/**
 * The invitation a newly created account holder receives, and the swap that
 * puts it where Payload's own "verify your email" template was.
 *
 * ⚠ **`auth.verify` is kept for the COLUMN, not for Payload's verify mail.** It
 * is what creates `_verified`, and the JWT strategy yields no user while that
 * column is false — so `_verified` is the accepted/not-accepted flag this whole
 * flow turns on. Only the two generators are repointed; the send stays where it
 * was.
 *
 * ⚠ **The framework's `token` argument is ignored.** It addresses
 * `/admin/<slug>/verify/:token`, a form that asks for a password this flow
 * never sets. The link below is a `manager-invite` token instead, a separate
 * audience from a sign-in link (`token.ts`), so neither can be replayed as the
 * other.
 *
 * ⚠ **A throw here costs the whole account.** `sendVerificationEmail` is awaited
 * inside `create`, before `commitTransaction` and outside any `try`, so the
 * create returns a 500 and rolls back. Keep every added step total: the role
 * labels fall back to the slug rather than throwing on an unknown one, and the
 * signing is pure. The one read cannot be made safe by catching it — it joins
 * the create's transaction, which Postgres marks aborted on any failed query,
 * so a swallowed error would only move the 500 to the commit.
 *
 * ⚠ **The brand follows what the invitation lists**, not the account's
 * `currentProject` alone — see `brandProject`. An account that has never
 * signed in has no current project, so the old rule sent every Atlas manager a
 * We Meditate invitation.
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
  doc: LoginDocument,
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
  payload,
  req,
  withResponsibilities,
}: {
  config: LoginCollectionConfig
  /** The account being invited. `id` and `type` decide what the email may claim. */
  doc: LoginDocument
  payload: Payload
  /** The create's own request, where there is one. @see summarizeGrants */
  req?: PayloadRequest
  /** @see summarizeGrants */
  withResponsibilities: boolean
}): Promise<PreparedInvite> {
  const summary = await summarizeGrants({
    collection: config.slug as string,
    id: doc.id,
    payload,
    req,
    type: doc.type,
    withResponsibilities,
  })

  return { project: brandProject(config.project?.(doc) ?? undefined, summary), summary }
}

export interface InviteMailArgs {
  doc: LoginDocument
  inviteUrl: string
  project: ProjectSlug | undefined
  summary: GrantSummary
}

/** Render the invitation, naming the access granted. */
export function generateInviteEmailHTML({
  doc,
  inviteUrl,
  project,
  summary,
}: InviteMailArgs): Promise<string> {
  return renderEmail(
    createElement(InviteEmail, {
      name: doc.name || doc.email || '',
      inviteUrl,
      validFor: INVITE_VALID_FOR,
      fullAccess: summary.fullAccess,
      grants: summary.grants,
      responsibilities: summary.responsibilities,
      project,
    }),
  )
}

/** @see generateInviteEmailHTML */
export function generateInviteEmailSubject(project: ProjectSlug | undefined): string {
  return stripNewlines(`You've been invited to ${getEmailBrand(project).productName}`)
}

/**
 * The `auth.verify` config one served collection installs, so its own file
 * carries the slug and nothing else.
 *
 * Payload asks for the body and the subject separately, on the same request.
 * One summary serves both, so the pair costs one read inside the create's
 * transaction rather than two.
 */
export function inviteVerification(
  config: LoginCollectionConfig,
): NonNullable<Exclude<IncomingAuthType['verify'], boolean>> {
  const prepare = (req: PayloadRequest, doc: LoginDocument) =>
    memoizeOnRequest(req, `login:invite:${String(config.slug)}:${doc.id}`, () =>
      prepareInvite({
        config,
        doc,
        payload: req.payload,
        req,
        // Nothing points at an account created one instant ago.
        withResponsibilities: false,
      }),
    )

  return {
    generateEmailHTML: async ({ req, user }) => {
      const doc = user as unknown as LoginDocument
      const { project, summary } = await prepare(req, doc)

      return generateInviteEmailHTML({
        doc,
        inviteUrl: inviteUrl(config, await signInviteFor(config, doc, req.payload.secret)),
        project,
        summary,
      })
    },
    generateEmailSubject: async ({ req, user }) =>
      generateInviteEmailSubject((await prepare(req, user as unknown as LoginDocument)).project),
  }
}
