'use server'

import { getPayload } from 'payload'

import { managersLogin } from '@/collections/Managers/login'
import { issueMagicLink, magicLinkEmailSchema, SIGNIN_VALID_FOR } from '@/plugins/login'

import payloadConfig from '@payload-config'

/**
 * This page either accepts the address or rejects what was typed.
 *
 * The two arms carry different fields because they are rendered differently:
 * acceptance replaces the form with a card, refusal keeps the form and puts the
 * message beneath it. A `title` on the refusal would never reach a screen.
 */
export type SignInOutcome =
  | { tone: 'error'; message: string }
  | { tone: 'success'; title: string; message: string }

/**
 * A refused link, stated above the form that fixes it.
 *
 * ⚠ **The retry is the form, not a button to elsewhere.** The redeem route
 * redirects here with `?error=`, and this page already asks for a link — so the
 * reader is never told to request one on a page that cannot.
 *
 * Both reasons the redeem route distinguishes, and no more: a refusal that
 * named which check failed would describe them to whoever is probing them.
 */
export type SignInNotice = { tone: 'error' | 'warning'; title: string; message: string }

export const LINK_NOTICES: Record<'expired' | 'invalid', SignInNotice> = {
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
}

/** Narrows a `?error=` value to a notice, so an unknown one shows nothing. */
export function linkNotice(reason: string | undefined): SignInNotice | null {
  return reason === 'expired' || reason === 'invalid' ? LINK_NOTICES[reason] : null
}

/**
 * ⚠ **The one answer a submitted address gets.** It must not vary with whether
 * a manager holds it, whether that manager is active, or whether one was sent a
 * link seconds ago — any of those would be an account-enumeration oracle on a
 * page anyone can open. The request endpoint holds the same discipline, and
 * `issueMagicLink` is the shared body that keeps both honest.
 */
const SENT: SignInOutcome = {
  tone: 'success',
  title: 'Check your email',
  message:
    `If that address belongs to a manager account, a sign-in link is on its way. ` +
    `The link is valid for ${SIGNIN_VALID_FOR}.`,
}

/**
 * Rejecting a malformed address is not an oracle: it reads the typed string and
 * never the account table.
 */
const MALFORMED: SignInOutcome = {
  tone: 'error',
  message: 'That does not look like an email address. Please check it and try again.',
}

/**
 * Server Action behind the sign-in form.
 *
 * It parses with the endpoint's own schema and runs the endpoint's own body, so
 * the throttle, the eligibility refusal and the uniform answer have a single
 * implementation — see `issueMagicLink`.
 */
export async function requestSignInLinkAction(
  _prev: SignInOutcome | null,
  formData: FormData,
): Promise<SignInOutcome> {
  const parsed = magicLinkEmailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return MALFORMED

  const payload = await getPayload({ config: payloadConfig })

  try {
    await issueMagicLink({ payload, config: managersLogin, email: parsed.data.email })
  } catch (error) {
    // Swallowed for the same reason the endpoint swallows it: only a real
    // address gets as far as a send, so a surfaced transport failure would
    // report that the address is real.
    payload.logger.error({
      msg: 'managers sign-in page: could not issue a sign-in link',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return SENT
}
