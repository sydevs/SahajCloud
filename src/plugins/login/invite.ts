import type { LoginCollectionConfig, LoginDocument } from './types'
import type { IncomingAuthType, Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { InviteEmail } from '@/emails/InviteEmail'
import { stripNewlines } from '@/lib/utilities/emailSafeText'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand, renderEmail } from '@/plugins/email'

import { summarizeGrants } from './grantSummary'
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

export interface InviteMailArgs {
  /** The served collection `doc` belongs to. @see summarizeGrants */
  collection: string
  /** The account being invited. `id` and `type` decide what the email may claim. */
  doc: LoginDocument
  inviteUrl: string
  payload: Payload
  project: ProjectSlug | undefined
  /** The create's own request, where there is one. @see summarizeGrants */
  req?: PayloadRequest
}

/** Render the invitation, naming the access granted. */
export async function generateInviteEmailHTML({
  collection,
  doc,
  inviteUrl,
  payload,
  project,
  req,
}: InviteMailArgs): Promise<string> {
  const { fullAccess, grants } = await summarizeGrants({
    collection,
    id: doc.id,
    payload,
    req,
    type: doc.type,
  })

  return renderEmail(
    createElement(InviteEmail, {
      name: doc.name || doc.email || '',
      inviteUrl,
      validFor: INVITE_VALID_FOR,
      fullAccess,
      grants,
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
 * `generateEmailSubject` is typed sync by Payload, so the subject resolves from
 * `project` alone — which is why the branding lookup is not an async read.
 */
export function inviteVerification(
  config: LoginCollectionConfig,
): NonNullable<Exclude<IncomingAuthType['verify'], boolean>> {
  const projectOf = (user: unknown) => config.project?.(user as LoginDocument) ?? undefined

  return {
    generateEmailHTML: async ({ req, user }) => {
      const doc = user as unknown as LoginDocument
      const { payload } = req

      return generateInviteEmailHTML({
        collection: config.slug as string,
        doc,
        inviteUrl: inviteUrl(config, await signInviteFor(config, doc, payload.secret)),
        payload,
        project: projectOf(doc),
        req,
      })
    },
    generateEmailSubject: ({ user }) => generateInviteEmailSubject(projectOf(user)),
  }
}
