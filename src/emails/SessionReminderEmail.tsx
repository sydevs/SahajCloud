import { Link, Text } from 'react-email'

import type { RegistrationEmailDetails } from '@/lib/notifications/registrationDetails'
import { type EmailStrings, interpolate } from '@/lib/translations/emailStrings'
import type { EmailBrand } from '@/plugins/email'

import { EmailLayout, EventItinerary, styles } from './EmailLayout'

export interface SessionReminderEmailProps {
  /** Registrant's display name. */
  name: string
  /** Branding for the client service the registration came through. */
  brand: EmailBrand
  /** Localized chrome, pre-resolved — a template never queries. */
  strings: EmailStrings
  /** Event facts for the single upcoming occurrence (via `buildReminderEmailDetails`). */
  details: RegistrationEmailDetails
  /** Signed unsubscribe link for this registration. */
  unsubscribeUrl: string
}

/**
 * Registrant-facing reminder, sent ~24h before a session.
 *
 * The confirmation's itinerary for the *single next* occurrence, with no ICS
 * (the confirmation delivered the calendar) and an unsubscribe link that stops
 * further reminders for this registration.
 */
export function SessionReminderEmail({
  name,
  brand,
  strings,
  details,
  unsubscribeUrl,
}: SessionReminderEmailProps) {
  return (
    <EmailLayout
      brand={brand}
      heading={strings.reminder_heading}
      previewText={interpolate(strings.reminder_subject, { event: details.eventTitle })}
      footer={
        <>
          {strings.reminder_footer_reason}
          <br />
          <Link href={unsubscribeUrl} style={{ color: brand.colors.primary }}>
            {strings.unsubscribe_cta}
          </Link>
        </>
      }
    >
      <Text style={styles.paragraph}>{interpolate(strings.reminder_intro, { name })}</Text>
      <EventItinerary brand={brand} details={details} strings={strings} />
    </EmailLayout>
  )
}
