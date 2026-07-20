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
}: RegistrationConfirmationEmailProps) {
  const { location } = details

  return (
    <EmailLayout
      brand={brand}
      heading={strings.confirmation_heading}
      previewText={interpolate(strings.confirmation_subject, { event: details.eventTitle })}
    >
      <Text style={styles.paragraph}>{interpolate(strings.confirmation_intro, { name })}</Text>

      {/* The title heads the detail block rather than floating above it, so the
          box reads as one card: what the class is, then when and where. */}
      <Section style={detailBlock}>
        <Heading as="h3" style={eventTitle}>
          {details.eventTitle}
        </Heading>

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
          </DetailRow>
        ) : null}

        {details.contact ? (
          <DetailRow label={strings.contact_label} accent={brand.colors.primary}>
            {details.contact}
          </DetailRow>
        ) : null}
      </Section>

      {/* Both event types get a primary CTA in the same slot, so the layout
          reads the same either way. Only the online one repeats its URL as
          plain text: if a client strips the button, the join link is otherwise
          unrecoverable, whereas the venue address is still right above. */}
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

      {location.type === 'offline' && location.mapsUrl ? (
        <BrandButton href={location.mapsUrl} brand={brand}>
          {strings.directions_cta}
        </BrandButton>
      ) : null}

      {details.description ? (
        <>
          <Heading as="h4" style={sectionHeading}>
            {strings.about_label}
          </Heading>
          <Text style={styles.paragraph}>{details.description}</Text>
        </>
      ) : null}

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
  const { name, brand, strings, details, websiteUrl } = props
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
    if (location.mapsUrl) lines.push(`${strings.directions_cta}: ${location.mapsUrl}`)
  }

  if (details.contact) lines.push(`${strings.contact_label}: ${details.contact}`)

  if (details.description) {
    lines.push('', `${strings.about_label}:`, details.description)
  }

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
  // Neutral rather than the brand accent: the accent is already carried by the
  // header, the row labels, and the CTA, and the title reads as content — not
  // as another piece of chrome. `#333333` is the layout's existing body colour,
  // so this introduces no new shade.
  color: '#333333',
  // First element inside the detail block: 16px above matches the rows' rhythm,
  // and the following row supplies its own top margin below.
  margin: '16px 0 0',
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
