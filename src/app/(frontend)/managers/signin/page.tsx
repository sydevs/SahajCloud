import type { Metadata } from 'next'

import { getProjectEmailIcon, getProjectLabel } from '@/plugins/access'
import { DEFAULT_EMAIL_PROJECT, getEmailBrand } from '@/plugins/email'

import { SignInForm } from './SignInForm'

export const metadata: Metadata = {
  // The card header renders the same brand, so naming the tab anything else
  // puts two product names on one screen.
  title: `Sign in — ${getProjectLabel(DEFAULT_EMAIL_PROJECT)}`,
  // Not token-gated like its neighbours — this one is simply not a search
  // result.
  robots: { index: false, follow: false },
}

/**
 * Where a manager asks for a sign-in link, and where every refused link sends
 * them (#838).
 *
 * ⚠ **It never 404s, whatever it is given.** Its neighbours call `notFound()`
 * because a genuine token is the only way to reach them, so hiding them costs
 * nothing. This page is published — the admin login form links to it — and
 * hiding it would take away the retry path that every refusal tells the reader
 * to take.
 *
 * The default brand, not a project's: manager auth mail wears it too
 * (`Managers.auth`, #483), and no `sahaj-cloud` project slug exists to wear
 * instead.
 */
export default function ManagerSignInPage() {
  return (
    <SignInForm brand={getEmailBrand()} iconSrc={getProjectEmailIcon(DEFAULT_EMAIL_PROJECT)} />
  )
}
