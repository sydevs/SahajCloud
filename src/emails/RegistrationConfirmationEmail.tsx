import type { CSSProperties, ReactNode } from 'react'

import { Heading, Hr, Link, Section, Text } from 'react-email'

import type { RegistrationEmailDetails } from '@/lib/notifications/registrationDetails'
import { type EmailStrings, interpolate } from '@/lib/translations/emailStrings'
import type { EmailBrand } from '@/plugins/email'

import { BrandButton, EmailLayout, styles } from './EmailLayout'

export interface RegistrationConfirmationEmailProps {
  /** Registrant's display name. */
  name: string
  /** Branding for the client service the registration came through. */
  brand: EmailBrand
  /** Localized chrome, pre-resolved — a template never queries. */
  strings: EmailStrings
  /** The event facts to state. */
  details: RegistrationEmailDetails
  /** Client service's website, linked from the footer. */
  websiteUrl?: string | null
  /** Whether a calendar invite is attached, so the hint only shows when true. */
  hasCalendarAttachment?: boolean
}

/**
 * Registrant-facing confirmation for an event registration.
 *
 * Deliberately *not* shaped like `EventVerificationEmail`: that one is an admin
 * alert, built around a coloured callout banner demanding action by a deadline.
 * This is a guest email — no callout, no deadline, no urgency colour. It reads
 * as a labelled itinerary, and the only accent colour is the client service's
 * own brand.
 *
 * Reuses `EmailLayout` / `BrandButton` / `styles` unchanged; the label-value
 * rows below are the one local addition, and they don't belong in the shared
 * layout until a second template wants them.
 */
export function RegistrationConfirmationEmail({
  name,
  brand,
  strings,
  details,
  websiteUrl,
  hasCalendarAttachment = true,
}: RegistrationConfirmationEmailProps) {
  const { location } = details

  return (
    <EmailLayout
      brand={brand}
      heading={strings.confirmation_heading}
      previewText={interpolate(strings.confirmation_subject, { event: details.eventTitle })}
    >
      <Text style={styles.paragraph}>{interpolate(strings.confirmation_intro, { name })}</Text>

      <Heading as="h3" style={{ ...eventTitle, color: brand.colors.primary }}>
        {details.eventTitle}
      </Heading>

      <Section style={detailBlock}>
        <DetailRow label={strings.when_label} accent={brand.colors.primary}>
          {details.scheduleLine}
          {details.sessions ? (
            <>
              {' · '}
              {interpolate(strings.sessions_count, { count: details.sessions })}
            </>
          ) : null}
        </DetailRow>

        {location.type === 'offline' ? (
          <DetailRow label={strings.where_label} accent={brand.colors.primary}>
            {location.address}
            {location.mapsUrl ? (
              <>
                <br />
                <Link href={location.mapsUrl} style={{ color: brand.colors.primary }}>
                  {strings.map_link}
                </Link>
              </>
            ) : null}
          </DetailRow>
        ) : null}

        {details.contact ? (
          <DetailRow label={strings.contact_label} accent={brand.colors.primary}>
            {details.contact}
          </DetailRow>
        ) : null}
      </Section>

      {/* Online joining details get their own block: the URL is the single most
          important thing in the email, and it must survive a client that strips
          the button — hence the CTA *and* the selectable plain-text link. */}
      {location.type === 'online' ? (
        <>
          <BrandButton href={location.joinUrl} brand={brand}>
            {strings.online_cta}
          </BrandButton>
          <Text style={styles.hint}>
            {strings.online_link_hint}
            <br />
            <Link href={location.joinUrl} style={{ ...styles.link, color: brand.colors.primary }}>
              {location.joinUrl}
            </Link>
          </Text>
        </>
      ) : null}

      {details.description ? (
        <>
          <Heading as="h4" style={sectionHeading}>
            {strings.about_label}
          </Heading>
          <Text style={styles.paragraph}>{details.description}</Text>
        </>
      ) : null}

      {hasCalendarAttachment ? <Text style={styles.hint}>{strings.calendar_hint}</Text> : null}

      <Hr style={styles.hr} />

      <Text style={styles.footer}>
        {strings.footer_reason}
        {websiteUrl ? (
          <>
            <br />
            <Link href={websiteUrl} style={{ color: brand.colors.primary }}>
              {interpolate(strings.footer_website, { name: brand.productName })}
            </Link>
          </>
        ) : null}
      </Text>
    </EmailLayout>
  )
}

/**
 * Plain-text alternative.
 *
 * Kept beside the component so the two can't drift, and sent alongside the HTML
 * — a text part improves deliverability and is what a text-only client shows.
 */
export function registrationConfirmationText(props: RegistrationConfirmationEmailProps): string {
  const { name, brand, strings, details, websiteUrl, hasCalendarAttachment = true } = props
  const { location } = details

  const sessions = details.sessions
    ? ` · ${interpolate(strings.sessions_count, { count: details.sessions })}`
    : ''

  const lines: string[] = [
    strings.confirmation_heading,
    '',
    interpolate(strings.confirmation_intro, { name }),
    '',
    details.eventTitle,
    '',
    `${strings.when_label}: ${details.scheduleLine}${sessions}`,
  ]

  if (location.type === 'online') {
    lines.push(`${strings.where_label}: ${location.joinUrl}`)
  } else if (location.type === 'offline') {
    lines.push(`${strings.where_label}: ${location.address}`)
    if (location.mapsUrl) lines.push(`${strings.map_link}: ${location.mapsUrl}`)
  }

  if (details.contact) lines.push(`${strings.contact_label}: ${details.contact}`)

  if (details.description) {
    lines.push('', `${strings.about_label}:`, details.description)
  }

  if (hasCalendarAttachment) lines.push('', strings.calendar_hint)

  lines.push('', '—', strings.footer_reason)
  if (websiteUrl) {
    lines.push(`${interpolate(strings.footer_website, { name: brand.productName })}: ${websiteUrl}`)
  }

  return lines.join('\n')
}

/** Label-above-value row — the guest-email counterpart to an admin callout. */
function DetailRow({
  label,
  accent,
  children,
}: {
  label: string
  accent: string
  children: ReactNode
}) {
  return (
    <Section style={detailRow}>
      <Text style={{ ...detailLabel, color: accent }}>{label}</Text>
      <Text style={detailValue}>{children}</Text>
    </Section>
  )
}

const eventTitle: CSSProperties = {
  fontSize: '18px',
  margin: '0 0 20px',
}

const detailBlock: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '6px',
  padding: '4px 20px',
  margin: '0 0 24px',
}

const detailRow: CSSProperties = {
  margin: '16px 0',
}

const detailLabel: CSSProperties = {
  fontSize: '12px',
  fontWeight: 'bold',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  margin: '0 0 4px',
}

const detailValue: CSSProperties = {
  fontSize: '16px',
  margin: 0,
}

const sectionHeading: CSSProperties = {
  fontSize: '15px',
  margin: '24px 0 8px',
}
