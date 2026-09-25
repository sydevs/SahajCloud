'use client'

import { Button } from '@payloadcms/ui'

/**
 * "Email me a sign-in link" under the admin login form.
 *
 * `loginPlugin` supplies `href` from the served collection's
 * `requestPagePath`, so the control cannot point at a page that is not
 * configured. Purely additive — passwords still work, and the cut-over that
 * removes them is its own change.
 */
export default function RequestSignInLink({ href }: { href: string }) {
  return (
    <Button buttonStyle="secondary" el="link" size="large" to={href}>
      Email me a sign-in link
    </Button>
  )
}
