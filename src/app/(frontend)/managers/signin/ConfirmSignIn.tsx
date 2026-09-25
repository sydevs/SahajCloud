import type { EmailBrand } from '@/plugins/email'

import { PublicPage, pageHeading, pageLead, primaryButton } from '../../_components/PublicPage'

/**
 * The interstitial that stands between a delivered link and the session it buys.
 *
 * ⚠ **A plain form with no script is the whole defence.** Spending the link takes
 * a method a link-scanner does not use and a click it does not make, so anything
 * that would submit this on its own — an `onload`, a timer, a redirect — puts the
 * hazard straight back. A server component for that reason: there is no client
 * bundle here to grow one.
 *
 * @param actionUrl The absolute `POST /api/<slug>/redeem-…?token=…`. The
 *   credential rides the action rather than a hidden field, because a custom
 *   Payload endpoint is handed no parsed form body to read it from.
 *
 * The copy is a prop because an invitation is confirmed here too, on the same
 * page and behind the same form — only the words differ.
 */
export function ConfirmSignIn({
  actionUrl,
  brand,
  iconSrc,
  heading = 'Sign in',
  lead = 'Confirm it is you. This link works once.',
  submitLabel = 'Sign in',
}: {
  actionUrl: string
  brand: EmailBrand
  iconSrc: string
  heading?: string
  lead?: string
  submitLabel?: string
}) {
  return (
    <PublicPage iconSrc={iconSrc} title={brand.productName}>
      <h2 style={pageHeading}>{heading}</h2>
      <p style={pageLead}>{lead}</p>
      <form action={actionUrl} method="post">
        <button style={primaryButton(brand)} type="submit">
          {submitLabel}
        </button>
      </form>
    </PublicPage>
  )
}
