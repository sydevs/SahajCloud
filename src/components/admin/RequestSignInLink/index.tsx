'use client'

import { Button } from '@payloadcms/ui'

/**
 * "Email me a sign-in link" on the admin login page.
 *
 * `loginPlugin` supplies `href` from the served collection's
 * `requestPagePath`, so the control cannot point at a page that is not
 * configured.
 *
 * ⚠ **It is the whole login now, not an alternative to one.** Payload renders
 * `LoginForm` only while `disableLocalStrategy` is falsy
 * (`@payloadcms/next/dist/views/Login/index.js:75`), and `loginPlugin` sets it
 * (#840) — so this sits in the `afterLogin` slot of a page with no form above
 * it, which is why it is the primary action.
 */
export default function RequestSignInLink({ href }: { href: string }) {
  return (
    <Button buttonStyle="primary" el="link" size="large" to={href}>
      Email me a sign-in link
    </Button>
  )
}
