/**
 * The copy behind `?error=`, beside the action rather than in it.
 *
 * ⚠ **A `'use server'` module may export nothing but async functions.** Next
 * fails the build on a const or a sync function there, and neither `tsc` nor
 * the unit lane sees it — only `pnpm build` does.
 */

import { INVITE_VALID_FOR, SIGNIN_VALID_FOR } from '@/plugins/login'

/**
 * A refused link, stated above the form that fixes it.
 *
 * ⚠ **The retry is the form, not a button to elsewhere.** The redeem route
 * redirects here with `?error=`, and this page already asks for a link — so the
 * reader is never told to request one on a page that cannot.
 *
 * Only the reasons the two redeem routes distinguish, and no more: a refusal
 * that named which check failed would describe them to whoever is probing them.
 */
export type SignInNotice = { tone: 'error' | 'warning'; title: string; message: string }

export type NoticeReason = 'expired' | 'invalid' | 'invite-expired'

export const LINK_NOTICES: Record<NoticeReason, SignInNotice> = {
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
    title: 'This invitation has expired',
    message: `An invitation is valid for ${INVITE_VALID_FOR}. Ask for a fresh one below.`,
  },
}

/**
 * Narrows a `?error=` value to a notice, so an unknown one shows nothing.
 *
 * ⚠ `Object.hasOwn`, never `in`: the value is request-supplied, and `in` walks
 * the prototype chain — `?error=constructor` would hand the page a function.
 */
export function linkNotice(reason: string | undefined): SignInNotice | null {
  return reason && Object.hasOwn(LINK_NOTICES, reason)
    ? LINK_NOTICES[reason as NoticeReason]
    : null
}
