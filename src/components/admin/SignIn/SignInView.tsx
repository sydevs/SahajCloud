import type { AdminViewServerProps } from 'payload'

import { redirect } from 'next/navigation'
import { getSafeRedirect } from 'payload/shared'

import { acceptUrl, openUrl, redeemUrl } from '@/app/(frontend)/_components/loginUrls'
import { managersLogin } from '@/collections/Managers/login'
import Logo from '@/components/branding/Logo'
import { readInviteToken, readLinkToken, readSigninToken } from '@/plugins/login'

import { ConfirmSignIn } from './ConfirmSignIn'
import { LINK_NOTICES, linkNotice } from './notices'
import { SignInForm } from './SignInForm'

type SearchParams = NonNullable<AdminViewServerProps['searchParams']>

/** A query value as one string — Next hands a repeated key over as an array. */
const param = (params: SearchParams, key: string): string | undefined => {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

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
 * ⚠ **The `GET` a delivered link performs writes nothing.** The token is read to
 * tell a dead link from a live one, and reading it touches no document, which is
 * what keeps a mail scanner's fetch free of consequence. The burn lives behind
 * {@link ConfirmSignIn}'s form.
 *
 * ⚠ **`?invite=` and `?link=` are their links' own parameters, never
 * `?token=`.** The three links are separate JWT audiences (`token.ts`), so
 * reading an invitation with `readSigninToken` would refuse it as invalid — and
 * the reader would be told their invitation was already used.
 *
 * ⚠ **A signed-in visitor is sent on only when the URL carries nothing to
 * act on.** Payload's own view redirects every signed-in visitor, which would
 * send a manager following a reminder's "verify this event" link to the
 * dashboard instead of the event. A delivered link is confirmed whoever is
 * signed in.
 */
export default async function SignInView({ initPageResult, searchParams = {} }: AdminViewServerProps) {
  const { payload, user } = initPageResult.req
  const error = param(searchParams, 'error')
  const invite = param(searchParams, 'invite')
  const link = param(searchParams, 'link')
  const token = param(searchParams, 'token')

  if (user && !error && !invite && !link && !token) {
    redirect(
      getSafeRedirect({
        fallbackTo: payload.config.routes.admin,
        redirectTo: param(searchParams, 'redirect') ?? '',
      }),
    )
  }

  return (
    <>
      <div className="login__brand">
        <Logo />
      </div>
      <SignInBody error={error} invite={invite} link={link} secret={payload.secret} token={token} />
    </>
  )
}

async function SignInBody({
  error,
  invite,
  link,
  secret,
  token,
}: {
  error?: string
  invite?: string
  link?: string
  secret: string
  token?: string
}) {
  if (invite) {
    const result = await readInviteToken(invite, secret)

    if (result.status === 'valid' && result.claims.collection === managersLogin.slug) {
      return (
        <ConfirmSignIn
          actionUrl={acceptUrl(invite)}
          heading="Confirm your email"
          lead="Confirming activates your account and signs you in."
          submitLabel="Confirm email"
        />
      )
    }

    return (
      <SignInForm
        notice={LINK_NOTICES[result.status === 'expired' ? 'invite-expired' : 'invalid']}
      />
    )
  }

  if (link) {
    const result = await readLinkToken(link, secret)

    if (result.status === 'valid' && result.claims.collection === managersLogin.slug) {
      return (
        <ConfirmSignIn
          actionUrl={openUrl(link)}
          heading="Sign in to continue"
          lead={`Confirm it is you to open “${result.claims.label}”.`}
          submitLabel="Continue"
        />
      )
    }

    return (
      <SignInForm notice={LINK_NOTICES[result.status === 'expired' ? 'link-expired' : 'invalid']} />
    )
  }

  if (token) {
    const result = await readSigninToken(token, secret)

    // The audience is checked here as well as at the burn: a token minted for
    // another configured collection must not reach a managers confirmation.
    if (result.status === 'valid' && result.claims.collection === managersLogin.slug) {
      return (
        <ConfirmSignIn
          actionUrl={redeemUrl(token)}
          heading="Sign in"
          lead="Confirm it is you. This link works once."
          submitLabel="Sign in"
        />
      )
    }

    return <SignInForm notice={LINK_NOTICES[result.status === 'expired' ? 'expired' : 'invalid']} />
  }

  return <SignInForm notice={linkNotice(error)} />
}
