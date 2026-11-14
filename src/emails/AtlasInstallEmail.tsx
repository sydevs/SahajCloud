import { Column, Link, Row, Section, Text } from 'react-email'

import { CONTACT_EMAIL } from '@/lib/contact'
import type { EmailBrand } from '@/plugins/email'

import { BrandButtonRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

export interface AtlasInstallEmailProps {
  brand: EmailBrand
  /** Recipient display name (falls back to email upstream). */
  name: string
  /** The address this email goes to, which is the one they sign in with. */
  email: string
  /** The website the old map still runs on, as a bare host. */
  domain: string
  /** Signs them in on the service's Install tab, for `validFor`. */
  installUrl: string
  /** The same tab with no credential, behind the ordinary sign-in, for after `validFor`. */
  installTabUrl: string
  /** How long `installUrl` works, as a reader says it: "7 days". */
  validFor: string
  /** The admin's sign-in page, for after the link has expired. */
  signInUrl: string
  /** The new public map. */
  mapUrl: string
}

export const atlasInstallSubject = (domain: string) =>
  `Upgrade ${domain.replace(/^www\./, '')} to Sahaj Atlas v3`

const NEEDS = [
  {
    icon: '🔑',
    title: 'Access to edit your website,',
    text: 'such as its WordPress, Wix or Squarespace admin.',
  },
  { icon: '⏱️', title: 'About 15 minutes.', text: 'No technical knowledge is needed.' },
]

const STEPS = [
  {
    title: 'Press the button below.',
    text: 'It signs you in and opens your service’s Install tab.',
  },
  {
    title: 'Choose how your website is built:',
    text: 'WordPress, Wix, Squarespace, or something else.',
  },
  {
    title: 'Follow the steps on the page.',
    text: 'Everything you need to paste, such as your key, is already filled in.',
  },
  { title: 'Press Check at the end,', text: 'and we will confirm the new map is working.' },
]

/**
 * The one-off follow-up to `AtlasMigrationEmail`, for each manager of a service
 * whose website still runs the legacy atlas widget: how to swap it for the new
 * one on the Install tab (`scripts/send-atlas-migration-email.ts --email install`).
 * Written for volunteers, not for technical readers, and it ends on the buttons.
 * shortcut: a one-off for the Atlas cutover, delete it with its script once it has gone out.
 */
export function AtlasInstallEmail({
  brand,
  name,
  email,
  domain,
  installUrl,
  installTabUrl,
  validFor,
  signInUrl,
  mapUrl,
}: AtlasInstallEmailProps) {
  const link = { color: brand.colors.primary }
  return (
    <EmailLayout
      brand={brand}
      heading="Sahaj Atlas has upgraded to a new version!"
      previewText={`The map on ${domain} is still the old one. Here is how to switch it.`}
    >
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        We&apos;ve recently completed a major overhaul of the Sahaj Atlas. The map on{' '}
        <strong>{domain}</strong> is still pointing to the old version and classes won&apos;t be
        updated there anymore. This is a one time change. Switching it to the new map is quick, and
        you can do it yourself.
      </Text>
      <Text style={styles.paragraph}>
        Please help us by switching early so that we can shut down the old service which is costing
        us quite a bit of money. Thank you for your help and patience with this update.
      </Text>

      <SectionHeading>What you need</SectionHeading>
      <Section style={{ margin: '0 0 16px' }}>
        {NEEDS.map((need) => (
          <Row key={need.title}>
            <Column style={iconCell}>{need.icon}</Column>
            <Column style={textCell}>
              <strong>{need.title}</strong> {need.text}
            </Column>
          </Row>
        ))}
      </Section>

      <SectionHeading>How to install it</SectionHeading>
      <Section style={{ margin: '0 0 16px' }}>
        {STEPS.map((step, index) => (
          <Row key={step.title}>
            <Column style={{ ...iconCell, ...numberCell, color: brand.colors.primary }}>
              {index + 1}.
            </Column>
            <Column style={textCell}>
              <strong>{step.title}</strong> {step.text}
            </Column>
          </Row>
        ))}
        <Row>
          <Column style={iconCell}>🎨</Column>
          <Column style={textCell}>
            <strong>Make it yours.</strong> On the same page you can choose your colours and logo,
            and connect your mailing list.
          </Column>
        </Row>
      </Section>

      <Text style={styles.paragraph}>
        If you get stuck, please{' '}
        <Link href={`mailto:${CONTACT_EMAIL}`} style={link}>
          contact us
        </Link>
        . The button works for {validFor}. After that, sign in at{' '}
        <Link href={signInUrl} style={link}>
          {URL.parse(signInUrl)?.host ?? signInUrl}
        </Link>{' '}
        with <strong>{email}</strong> and open{' '}
        <Link href={installTabUrl} style={link}>
          your service’s Install tab
        </Link>
        .
      </Text>
      <BrandButtonRow
        brand={brand}
        buttons={[
          { href: installUrl, label: 'Open the Install tab' },
          { href: mapUrl, label: 'See the new map', variant: 'secondary' },
        ]}
      />
    </EmailLayout>
  )
}

const iconCell = { width: '32px', fontSize: '18px', verticalAlign: 'top', padding: '4px 0' }
const numberCell = { fontSize: '16px', lineHeight: '24px', fontWeight: 'bold' }
const textCell = { fontSize: '16px', lineHeight: '24px', verticalAlign: 'top', padding: '4px 0' }
