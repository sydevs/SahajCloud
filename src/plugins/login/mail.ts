import type { LoginMailArgs } from './types'

import { createElement } from 'react'

import { SignInLinkEmail } from '@/emails/SignInLinkEmail'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'


/**
 * The sign-in mail every served collection gets, unless it overrides a half.
 *
 * Nothing here is `managers`-specific. A collection that needs different copy
 * overrides
 * `generateEmailHTML` / `generateEmailSubject`, which mirror the two generators
 * `auth.verify` and `auth.forgotPassword` already take.
 */
export function generateEmailHTML({ doc, signInUrl, validFor }: LoginMailArgs): Promise<string> {
  return renderEmail(
    createElement(SignInLinkEmail, {
      name: doc.name || doc.email || '',
      signInUrl,
      validFor,
    }),
  )
}

/** @see generateEmailHTML */
export function generateEmailSubject(): string {
  return stripNewlines(`Your sign-in link — ${getEmailBrand().productName}`)
}

/**
 * Envelope `From`, not overridable.
 *
 * `MANAGER_EMAIL_FROM` is the sender for mail to an account holder, and every
 * collection this plugin can serve is an auth collection — so there is no
 * second audience to choose between. Payload's own auth mail takes the adapter
 * default instead; this project sets a sender per send, because Resend drops a
 * send from an unverified domain (#790).
 */
export function emailFrom(): string {
  return `${headerDisplayName(getEmailBrand().productName)} <${MANAGER_EMAIL_FROM}>`
}
