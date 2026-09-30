import type { SignInNotice } from './SignInForm'
import type { AdminViewServerProps } from 'payload'

import { Button } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import { getSafeRedirect } from 'payload/shared'

import { acceptUrl, openUrl, redeemUrl } from '@/app/(frontend)/_components/loginUrls'
import { managersLogin } from '@/collections/Managers/login'
import Logo from '@/components/branding/Logo'
import {
  INVITE_VALID_FOR,
  readInviteToken,
  readLinkToken,
  readSigninToken,
  SIGNIN_VALID_FOR,
} from '@/plugins/login'

import styles from './SignIn.module.css'
import { SignInForm } from './SignInForm'

/**
 * `/admin/login`, replacing Payload's own login view (#840): the one surface for
 * manager sign-in. It asks for a link, confirms a delivered one, and explains a
 * refused one.
 *
 * `loginPlugin` registers it as `admin.components.views.login`, which Payload's
 * route resolver prefers over the built-in view and still serves as a public
 * route. The minimal template and the `login` class around it are Payload's.
 *
 * ⚠ **One page, because a refusal must not arrive in a second visual language.**
 * The login plugin renders no HTML of its own — `?token=` reaches the
 * confirmation, and the redeem route sends every refusal back here as `?error=`,
 * where the form that fixes it is already on screen.
 *
 * ⚠ **A signed-in visitor is sent on only when the URL carries nothing to
 * act on.** Payload's own view redirects every signed-in visitor, which would
 * send a manager following a reminder's "verify this event" link to the
 * dashboard instead of the event. A delivered link is confirmed whoever is
 * signed in.
 */
export default async function SignInView({ initPageResult, searchParams = {} }: AdminViewServerProps) {
  const { payload, user } = initPageResult.req
  const query = (key: string): string | undefined => {
    // Next hands a repeated key over as an array.
    const value = searchParams[key]
    return Array.isArray(value) ? value[0] : value
  }
  const error = query('error')
  const invite = query('invite')
  const link = query('link')
  const token = query('token')

  if (user && !error && !invite && !link && !token) {
    redirect(
      getSafeRedirect({
        fallbackTo: payload.config.routes.admin,
        redirectTo: query('redirect') ?? '',
      }),
    )
  }

  const shown = await deliveredLink({ invite, link, token }, payload.secret)

  return (
    <>
      <div className="login__brand">
        <Logo />
      </div>
      {shown && 'actionUrl' in shown ? (
        // ⚠ **A plain `POST` form that only a click submits is the whole
        // defence.** Spending the link takes a method a link-scanner does not
        // use and a click it does not make, so anything that would submit this
        // on its own — an `onload`, a timer, a redirect — puts the hazard
        // straight back. The credential rides `action` rather than a hidden
        // field, because a custom Payload endpoint is handed no parsed form body.
        <form action={shown.actionUrl} className={styles.stack} method="post">
          <h2>{shown.heading}</h2>
          <p>{shown.lead}</p>
          <Button buttonStyle="primary" size="large" type="submit">
            {shown.submitLabel}
          </Button>
        </form>
      ) : (
        <SignInForm notice={shown ?? linkNotice(error)} />
      )}
    </>
  )
}

/** The page standing between a delivered link and the session it buys. */
type Confirmation = { actionUrl: string; heading: string; lead: string; submitLabel: string }

/**
 * What a delivered link in the URL earns: its confirmation, or the notice that
 * says why not. `null` when the URL carries none.
 *
 * ⚠ **The `GET` a delivered link performs writes nothing.** The token is read to
 * tell a dead link from a live one, and reading it touches no document, which is
 * what keeps a mail scanner's fetch free of consequence. The burn lives behind
 * the confirmation's form.
 *
 * ⚠ **`?invite=` and `?link=` are their links' own parameters, never
 * `?token=`.** The three links are separate JWT audiences (`token.ts`), so
 * reading an invitation with `readSigninToken` would refuse it as invalid — and
 * the reader would be told their invitation was already used.
 */
async function deliveredLink(
  { invite, link, token }: { invite?: string; link?: string; token?: string },
  secret: string,
): Promise<Confirmation | SignInNotice | null> {
  if (invite) {
    return confirmOrRefuse(await readInviteToken(invite, secret), 'invite-expired', () => ({
      actionUrl: acceptUrl(invite),
      heading: 'Confirm your email',
      lead: 'Confirming activates your account and signs you in.',
      submitLabel: 'Confirm email',
    }))
  }
  if (link) {
    return confirmOrRefuse(await readLinkToken(link, secret), 'link-expired', ({ label }) => ({
      actionUrl: openUrl(link),
      heading: 'Sign in to continue',
      lead: `Confirm it is you to open “${label}”.`,
      submitLabel: 'Continue',
    }))
  }
  if (token) {
    return confirmOrRefuse(await readSigninToken(token, secret), 'expired', () => ({
      actionUrl: redeemUrl(token),
      heading: 'Sign in',
      lead: 'Confirm it is you. This link works once.',
      submitLabel: 'Sign in',
    }))
  }
  return null
}

/**
 * The audience is checked here as well as at the burn: a token minted for
 * another configured collection must not reach a managers confirmation.
 */
function confirmOrRefuse<C extends { collection: string }>(
  result: { status: 'valid'; claims: C } | { status: 'expired' | 'invalid' },
  expired: NoticeReason,
  confirm: (claims: C) => Confirmation,
): Confirmation | SignInNotice {
  if (result.status === 'valid' && result.claims.collection === managersLogin.slug) {
    return confirm(result.claims)
  }
  return NOTICES[result.status === 'expired' ? expired : 'invalid']
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
function linkNotice(reason: string | undefined): SignInNotice | null {
  return reason && Object.hasOwn(NOTICES, reason) ? NOTICES[reason as NoticeReason] : null
}
