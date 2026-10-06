'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import {
  issueMagicLink,
  magicLinkEmailSchema,
  sessionCookieParts,
  SIGNIN_VALID_FOR,
} from '@/plugins/login'
import { managersLoginHere } from '@/plugins/previewAdmin'

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
  // Not the bare `managersLogin`: that has no `previewAutoSignIn`, so a preview's
  // own form would mail its admin rather than sign them in.
  const config = managersLoginHere()

  let signedIn: Awaited<ReturnType<typeof issueMagicLink>>
  try {
    signedIn = await issueMagicLink({ payload, config, email: parsed.data.email })
  } catch (error) {
    // Swallowed for the same reason the endpoint swallows it: only a real
    // address gets as far as a send, so a surfaced transport failure would
    // report that the address is real.
    payload.logger.error({
      msg: 'managers sign-in page: could not issue a sign-in link',
      error: error instanceof Error ? error.message : String(error),
    })
    return SENT
  }

  // A Railway preview signs its own admin in rather than mailing a link, which
  // is the whole of how anyone gets into a preview since #840 — see
  // `previewAutoSignIn`. Nowhere else can reach this: the option is unset in
  // production, in CI and in local dev.
  //
  // ⚠ Outside the `try` on purpose: Next signals a navigation by throwing, and
  // a `catch` around `redirect` would swallow it — leaving the caller on this
  // page, signed in, reading "check your email".
  if (signedIn) {
    const { name, options, value } = sessionCookieParts(payload, config.slug, signedIn.token)
    ;(await cookies()).set(name, value, options)
    redirect(payload.config.routes.admin)
  }

  return SENT
}
