import type { Metadata } from 'next'

import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import { readUnsubscribeToken } from '@/lib/registrations/unsubscribeToken'
import { interpolate, resolveEmailStrings } from '@/lib/translations/emailStrings'
import type { Event } from '@/payload-types'
import { getProjectEmailIcon } from '@/plugins/access'
import { getEmailBrand } from '@/plugins/email'

import config from '@payload-config'

import { UnsubscribeCard } from './UnsubscribeCard'
import { UnsubscribeForm } from './UnsubscribeForm'

export const metadata: Metadata = {
  title: 'Unsubscribe — Sahaj Atlas',
  // Token-gated, per-recipient page — keep it out of search indexes.
  robots: { index: false, follow: false },
}

const BRAND = 'sahaj-atlas' as const

/**
 * Logged-out unsubscribe landing page for registrant session reminders. The
 * signed token (in `?token=`) is the sole access gate — a missing/tampered token
 * 404s. A valid token shows an "Unsubscribe" button (the mutation runs only on
 * that POST, never on this GET, so an email link-scanner can't auto-unsubscribe);
 * an already-unsubscribed registration shows the done card directly. All copy is
 * rendered in the registration's stored locale.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = '' } = await searchParams
  const payload = await getPayload({ config })
  const brand = getEmailBrand(BRAND)
  const iconSrc = getProjectEmailIcon(BRAND)

  const result = await readUnsubscribeToken(token, payload.secret)

  // Missing / malformed / tampered → the page does not exist.
  if (result.status !== 'valid') notFound()

  const registration = await payload
    .findByID({
      collection: 'registrations',
      id: result.claims.registrationId,
      depth: 1,
      overrideAccess: true,
    })
    .catch(() => null)

  // The token is valid but the registration is gone — nothing to unsubscribe.
  if (!registration) notFound()

  const strings = await resolveEmailStrings({
    payload,
    locale: registration.locale as LocaleCode | null,
  })

  // Already unsubscribed — show the done card straight away (the flow is idempotent).
  if (registration.remindersUnsubscribedAt) {
    return (
      <UnsubscribeCard
        brand={brand}
        iconSrc={iconSrc}
        tone="success"
        title={strings.unsubscribe_done_title}
        message={strings.unsubscribe_done_message}
      />
    )
  }

  const event = typeof registration.event === 'object' ? (registration.event as Event) : null
  const eventTitle = event && typeof event.title === 'string' ? event.title : 'your class'

  return (
    <UnsubscribeForm
      brand={brand}
      iconSrc={iconSrc}
      token={token}
      heading={strings.unsubscribe_heading}
      intro={interpolate(strings.unsubscribe_intro, { event: eventTitle })}
      confirmLabel={strings.unsubscribe_confirm_cta}
      workingLabel={strings.unsubscribe_working}
    />
  )
}
