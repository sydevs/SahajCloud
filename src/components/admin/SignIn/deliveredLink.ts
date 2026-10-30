import type { SignInNotice } from './SignInForm'
import type { Payload } from 'payload'

import { redeemUrl } from '@/app/(frontend)/_components/loginUrls'
import { managersLogin } from '@/collections/Managers/login'
import type { LoginDocument, LoginToken } from '@/plugins/login'
import {
  EXPIRED_REASON,
  INVITE_VALID_FOR,
  readAnyLoginToken,
  SIGNIN_VALID_FOR,
} from '@/plugins/login'

/** The page standing between a delivered link and the session it buys. */
export type Confirmation = {
  actionUrl: string
  /** Whose session the form buys, so a visitor already signed in can tell. */
  email: string
  heading: string
  detail?: string
  submitLabel: string
}

/**
 * What a delivered link earns: its confirmation, or the notice that says why
 * not. Any of the three kinds arrives as `?token=`; its own audience says which
 * it is (`readAnyLoginToken`).
 *
 * ⚠ **The `GET` a delivered link performs writes nothing.** The token is read to
 * tell a dead link from a live one, and the account it names is read to say who
 * it signs in, and neither touches a document — which is what keeps a mail
 * scanner's fetch free of consequence. The burn lives behind the confirmation's
 * form.
 *
 * Naming the account is no oracle: only an authentic token gets this far, and
 * whoever holds one was mailed at that address.
 */
export async function deliveredLink(
  token: string,
  payload: Payload,
): Promise<Confirmation | SignInNotice> {
  const read = await readAnyLoginToken(token, payload.secret)
  if (read.status === 'expired') return NOTICES[EXPIRED_REASON[read.kind]]
  // The audience is checked here as well as at the burn: a token minted for
  // another configured collection must not reach a managers confirmation.
  if (read.status !== 'valid' || read.token.claims.collection !== managersLogin.slug) {
    return NOTICES.invalid
  }

  const account = await accountFor(read.token, payload)
  // Refused now rather than after the click, with the redeem route's own answer.
  if (!account?.email) return NOTICES.invalid

  const name = typeof account.name === 'string' ? account.name.trim() : ''
  const who = name || account.email
  const address = name ? account.email : undefined
  const confirmation = { actionUrl: redeemUrl(token), email: account.email }

  switch (read.token.kind) {
    case 'invite':
      return {
        ...confirmation,
        heading: `Welcome, ${who}`,
        detail: address,
        submitLabel: 'Activate account',
      }
    case 'link':
      return {
        ...confirmation,
        heading: `Sign in as ${who}`,
        detail: [address, `opens “${read.token.claims.label}”`].filter(Boolean).join(' · '),
        submitLabel: 'Continue',
      }
    case 'signin':
      return {
        ...confirmation,
        heading: `Sign in as ${who}`,
        detail: address,
        submitLabel: 'Continue',
      }
  }
}

/**
 * The account a link names, or `null` when it is gone or no longer eligible —
 * the two checks the redeem route makes before anything else.
 */
async function accountFor(token: LoginToken, payload: Payload) {
  try {
    const account = await payload.findByID({
      collection: managersLogin.slug,
      id: token.claims.userId,
      depth: 0,
      // `joins` narrows per collection, so over the slug union it collapses to
      // `undefined` — the same cast the redeem route makes.
      joins: false as never,
      overrideAccess: true,
      select: { email: true, name: true, ...managersLogin.select },
    })
    const doc = account as unknown as LoginDocument
    return managersLogin.isEligible && !managersLogin.isEligible(doc) ? null : doc
  } catch {
    // `findByID` throws `NotFound` for a deleted account rather than returning null.
    return null
  }
}

/**
 * A refused link, stated above the form that fixes it.
 *
 * ⚠ **The retry is the form, not a button to elsewhere.** The redeem route
 * redirects here with `?error=`, and this page already asks for a link — so the
 * reader is never told to request one on a page that cannot.
 *
 * Only the reasons the redeem routes distinguish, and no more: a refusal
 * that named which check failed would describe them to whoever is probing them.
 */
type NoticeReason = 'expired' | 'invalid' | 'invite-accepted' | 'invite-expired' | 'link-expired'

const NOTICES: Record<NoticeReason, SignInNotice> = {
  expired: {
    tone: 'warning',
    title: 'This link has expired',
    message: `A sign-in link is valid for ${SIGNIN_VALID_FOR}. Ask for a fresh one below.`,
  },
  invalid: {
    tone: 'error',
    title: 'This link is not valid',
    message: 'It may already have been used. Ask for a fresh one below.',
  },
  // An invitation lasts days rather than minutes, so the sign-in copy would
  // misstate it. Asking below re-sends the invitation itself, not a sign-in
  // link, while the account is still unaccepted — see `issueMagicLink`.
  'invite-expired': {
    tone: 'warning',
    title: 'This link has expired',
    message: `A confirmation link is valid for ${INVITE_VALID_FOR}. Ask for a fresh one below.`,
  },
  // Each project sends its own invitation, so a second one arrives already
  // spent by the first. The account is active: a sign-in link gets them in.
  'invite-accepted': {
    tone: 'warning',
    title: 'Your email is already confirmed',
    message: 'Your account is active. Ask for a sign-in link below.',
  },
  // A reminder's link outlives a sign-in link by days, and the next reminder
  // carries a fresh one — but a sign-in link from here reaches the same page.
  'link-expired': {
    tone: 'warning',
    title: 'This link has expired',
    message: 'Ask for a sign-in link below, then open the event from the admin.',
  },
}

/**
 * Narrows a `?error=` value to a notice, so an unknown one shows nothing.
 *
 * ⚠ `Object.hasOwn`, never `in`: the value is request-supplied, and `in` walks
 * the prototype chain — `?error=constructor` would hand the page a function.
 */
export function linkNotice(reason: string | undefined): SignInNotice | null {
  return reason && Object.hasOwn(NOTICES, reason) ? NOTICES[reason as NoticeReason] : null
}
