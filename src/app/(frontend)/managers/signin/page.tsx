import type { Metadata } from 'next'

import { getPayload } from 'payload'

import { managersLogin } from '@/collections/Managers/login'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { getProjectEmailIcon, getProjectLabel } from '@/plugins/access'
import { DEFAULT_EMAIL_PROJECT, getEmailBrand } from '@/plugins/email'
import { readSigninToken } from '@/plugins/login'

import payloadConfig from '@payload-config'

import { LINK_NOTICES, linkNotice } from './actions'
import { ConfirmSignIn } from './ConfirmSignIn'
import { SignInForm } from './SignInForm'


export const metadata: Metadata = {
  // The card header renders the same brand, so naming the tab anything else
  // puts two product names on one screen.
  title: `Sign in — ${getProjectLabel(DEFAULT_EMAIL_PROJECT)}`,
  // Not token-gated like its neighbours — this one is simply not a search
  // result.
  robots: { index: false, follow: false },
  // ⚠ A delivered link carries the credential in this page's query string, so
  // no onward request may pass it along as a `Referer`.
  referrer: 'no-referrer',
}

/**
 * ⚠ **Never prerendered, and never cached.** The token above is why: a shared
 * cache holding a rendered confirmation would serve one manager's credential to
 * the next reader.
 */
export const dynamic = 'force-dynamic'

/** Where the form behind the confirmation posts. The `POST` is what burns the link. */
const redeemUrl = (token: string) =>
  `${getServerUrl()}/api/${managersLogin.slug}/redeem-magic-link?token=${encodeURIComponent(token)}`

/**
 * The one logged-out surface for manager sign-in (#838): it asks for a link,
 * confirms a delivered one, and explains a refused one.
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
 * ⚠ **It never 404s, whatever it is given.** Its neighbours call `notFound()`
 * because a genuine token is the only way to reach them. This page is published
 * — the admin login form links to it — and hiding it would take away the retry
 * every refusal points at.
 *
 * The default brand, not a project's: manager auth mail wears it too
 * (`Managers.auth`, #483), and no `sahaj-cloud` project slug exists to wear
 * instead.
 */
export default async function ManagerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>
}) {
  const { error, token } = await searchParams
  const brand = getEmailBrand()
  const iconSrc = getProjectEmailIcon(DEFAULT_EMAIL_PROJECT)

  if (token) {
    const payload = await getPayload({ config: payloadConfig })
    const result = await readSigninToken(token, payload.secret)

    // The audience is checked here as well as at the burn: a token minted for
    // another configured collection must not reach a managers confirmation.
    if (result.status === 'valid' && result.claims.collection === managersLogin.slug) {
      return <ConfirmSignIn actionUrl={redeemUrl(token)} brand={brand} iconSrc={iconSrc} />
    }

    return (
      <SignInForm
        brand={brand}
        iconSrc={iconSrc}
        notice={LINK_NOTICES[result.status === 'expired' ? 'expired' : 'invalid']}
      />
    )
  }

  return <SignInForm brand={brand} iconSrc={iconSrc} notice={linkNotice(error)} />
}
