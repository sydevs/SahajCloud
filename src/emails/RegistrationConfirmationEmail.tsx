import type { CSSProperties } from 'react'

import { Heading, Link, Text } from 'react-email'

import type { LocaleCode } from '@/lib/locales'
import type { RegistrationEmailDetails } from '@/lib/notifications/registrationDetails'
import { type EmailStrings, interpolate, pluralize } from '@/lib/translations/emailStrings'
import type { EmailBrand } from '@/plugins/email'

import { EmailLayout, EventItinerary, styles } from './EmailLayout'

export interface RegistrationConfirmationEmailProps {
  /** Registrant's display name. */
  name: string
  /** Branding for the client service the registration came through. */
  brand: EmailBrand
  /** Localized chrome, pre-resolved — a template never queries. */
  strings: EmailStrings
  /** The event facts to state. */
  details: RegistrationEmailDetails
  /** Registrant's locale — drives plural-form selection (e.g. session count). */
  locale?: LocaleCode | null
  /** Client service's website, linked from the footer. */
  websiteUrl?: string | null
}

/**
 * Registrant-facing confirmation for an event registration.
 *
 * A guest email, not an alert like `EventVerificationEmail`: no callout, no
 * deadline, no urgency colour — a labelled itinerary whose only accent is the
 * client service's own brand.
 */
export function RegistrationConfirmationEmail({
  name,
  brand,
  strings,
  details,
  locale,
  websiteUrl,
}: RegistrationConfirmationEmailProps) {
  return (
    <EmailLayout
      brand={brand}
      heading={strings.confirmation_heading}
      previewText={interpolate(strings.confirmation_subject, { event: details.eventTitle })}
      footer={
        <>
          {strings.footer_reason}
          {websiteUrl ? (
            <>
              <br />
              <Link href={websiteUrl} style={{ color: brand.colors.primary }}>
                {interpolate(strings.footer_website, { name: brand.productName })}
              </Link>
            </>
          ) : null}
        </>
      }
    >
      <Text style={styles.paragraph}>{interpolate(strings.confirmation_intro, { name })}</Text>

      <EventItinerary
        brand={brand}
        details={details}
        strings={strings}
        when={
          <>
            {details.scheduleLine}
            {details.sessions ? (
              <>
                {' · '}
                {pluralize(strings, 'sessions_count', details.sessions, locale)}
              </>
            ) : null}
          </>
        }
      />

      {details.description ? (
        <>
          <Heading as="h4" style={sectionHeading}>
            {strings.about_label}
          </Heading>
          <Text style={styles.paragraph}>{details.description}</Text>
        </>
      ) : null}
    </EmailLayout>
  )
}

const sectionHeading: CSSProperties = {
  fontSize: '15px',
  margin: '24px 0 8px',
}
