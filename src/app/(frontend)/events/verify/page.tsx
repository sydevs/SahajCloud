import type { Metadata } from 'next'

import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { serverEnv } from '@/lib/env'
import { buildEventEmailDetails } from '@/lib/notifications'
import { getProjectEmailIcon } from '@/plugins/access'
import { getEmailBrand } from '@/plugins/email'
import { readLinkToken } from '@/plugins/login'

import config from '@payload-config'

import { VerifyForm } from './VerifyForm'
import { openUrl } from '../../_components/loginUrls'
import { VerificationCard } from '../../_components/VerificationCard'

export const metadata: Metadata = {
  title: 'Verify event — Sahaj Atlas',
  // Token-gated, per-recipient page — keep it out of search indexes.
  robots: { index: false, follow: false },
  // The link carries its credential in the query string.
  referrer: 'no-referrer',
}

/** Never cached: a shared cache would hand one manager's link to the next reader. */
export const dynamic = 'force-dynamic'

const BRAND = 'sahaj-atlas' as const

/**
 * Logged-out event verification, one click from a reminder.
 *
 * ⚠ **Opening it verifies nothing.** Mail scanners fetch every link in every
 * email, and some render the page — none submits a form. So the `GET` reads the
 * link and shows the event, and the verification runs only on the "Verify this
 * event" button's `POST` (a Server Action). "Update the details" is a `POST`
 * too, to the page link's redeem route, which signs the manager in and lands
 * on the event's admin page.
 *
 * The link is a login-plugin page link (`manager-link`) whose `verifies` claim
 * names the event. A tampered one, or one without that claim, 404s — the page
 * is invisible without a genuine link. A pre-#839 `?token=` link arrives as an
 * expired one: it is authentic, and its holder deserves to be told what to do.
 */
export default async function VerifyEventPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string; token?: string }>
}) {
  const { link = '', token } = await searchParams
  const payload = await getPayload({ config })
  const brand = getEmailBrand(BRAND)
  const iconSrc = getProjectEmailIcon(BRAND)
  const atlasHome = serverEnv.WEMEDITATE_WEB_URL ? `${serverEnv.WEMEDITATE_WEB_URL}/map` : null

  const result = await readLinkToken(link, payload.secret)

  if (result.status === 'expired' || (!link && token)) {
    return (
      <VerificationCard
        brand={brand}
        iconSrc={iconSrc}
        tone="warning"
        title="This link has expired"
        message="Please use the link in your latest reminder email, or sign in to verify the event."
        actions={[
          { label: 'Sign in', href: '/managers/signin' },
          ...(atlasHome
            ? [{ label: 'Back to Sahaj Atlas', href: atlasHome, variant: 'secondary' as const }]
            : []),
        ]}
      />
    )
  }

  if (
    result.status !== 'valid' ||
    result.claims.collection !== 'managers' ||
    result.claims.verifies === undefined
  ) {
    notFound()
  }

  const event = await payload
    .findByID({ collection: 'events', id: result.claims.verifies, overrideAccess: true })
    .catch(() => null)
  // Authentic, but the event is gone — nothing to verify.
  if (!event) notFound()

  const eventTitle = typeof event.title === 'string' ? event.title : `Event #${event.id}`
  const details = await buildEventEmailDetails({ payload, event }).catch(() => null)
  // Present only while the event is published (a publish-gated virtual field).
  const eventUrl = typeof event.webUrl === 'string' ? event.webUrl : null

  return (
    <VerifyForm
      brand={brand}
      iconSrc={iconSrc}
      link={link}
      editUrl={openUrl(link)}
      eventTitle={eventTitle}
      details={details}
      eventUrl={eventUrl}
      atlasHome={atlasHome}
    />
  )
}
