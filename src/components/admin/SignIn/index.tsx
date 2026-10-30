import type { AdminViewServerProps } from 'payload'

import { Button } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import { getSafeRedirect } from 'payload/shared'

import Logo from '@/components/branding/Logo'

import { deliveredLink, linkNotice } from './deliveredLink'
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
 *
 * `?redirect=` is where Payload sends a signed-out visitor from. The form
 * carries it into the emailed link, so following that link lands on the page
 * the visitor first asked for (`returnPath`).
 */
export default async function SignInView({
  initPageResult,
  searchParams = {},
}: AdminViewServerProps) {
  const { payload, user } = initPageResult.req
  const query = (key: string): string | undefined => {
    // Next hands a repeated key over as an array.
    const value = searchParams[key]
    return Array.isArray(value) ? value[0] : value
  }
  const error = query('error')
  const token = query('token')
  const returnTo = query('redirect')

  if (user && !error && !token) {
    redirect(
      getSafeRedirect({ fallbackTo: payload.config.routes.admin, redirectTo: returnTo ?? '' }),
    )
  }

  const shown = token ? await deliveredLink(token, payload) : null
  const signedInAs = user && 'email' in user ? user.email : undefined

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
          {shown.detail ? <p>{shown.detail}</p> : null}
          {signedInAs && signedInAs !== shown.email ? (
            <p>Currently signed in as {signedInAs}.</p>
          ) : null}
          <Button buttonStyle="primary" size="large" type="submit">
            {shown.submitLabel}
          </Button>
        </form>
      ) : (
        <SignInForm notice={shown ?? linkNotice(error)} returnTo={returnTo} />
      )}
    </>
  )
}
