import { Button } from '@payloadcms/ui'

import styles from './SignIn.module.css'

/**
 * The interstitial that stands between a delivered link and the session it buys.
 *
 * ⚠ **A plain `POST` form that only a click submits is the whole defence.**
 * Spending the link takes a method a link-scanner does not use and a click it
 * does not make, so anything that would submit this on its own — an `onload`, a
 * timer, a redirect — puts the hazard straight back.
 *
 * @param actionUrl The absolute `POST /api/<slug>/redeem-…?token=…`. The
 *   credential rides the action rather than a hidden field, because a custom
 *   Payload endpoint is handed no parsed form body to read it from.
 *
 * All three copy props are required, because an invitation is confirmed here
 * too, on the same page and behind the same form — only the words differ. A
 * default would put one of the two sets here and leave the other at its call
 * site, so reviewing the page's words would mean reading both files.
 */
export function ConfirmSignIn({
  actionUrl,
  heading,
  lead,
  submitLabel,
}: {
  actionUrl: string
  heading: string
  lead: string
  submitLabel: string
}) {
  return (
    <form action={actionUrl} className={styles.stack} method="post">
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.lead}>{lead}</p>
      <Button
        buttonStyle="primary"
        className={styles.action}
        margin={false}
        size="large"
        type="submit"
      >
        {submitLabel}
      </Button>
    </form>
  )
}
