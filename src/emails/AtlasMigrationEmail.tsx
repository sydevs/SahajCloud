import { Column, Img, Link, Row, Section, Text } from 'react-email'

import { CONTACT_EMAIL } from '@/lib/contact'
import type { EmailBrand } from '@/plugins/email'
import type { Responsibility } from '@/plugins/login/grantSummary'

import {
  BrandButtonRow,
  EmailLayout,
  ResponsibilityRows,
  SectionHeading,
  styles,
} from './EmailLayout'

export interface AtlasMigrationEmailProps {
  brand: EmailBrand
  /** Recipient display name (falls back to email upstream). */
  name: string
  /** The address this email goes to, which is the one they sign in with. */
  email: string
  /** Everything they look after, as an invitation naming all of it would list it. */
  responsibilities: Responsibility[]
  /** The new admin's sign-in page. */
  signInUrl: string
  /** The new public map. */
  mapUrl: string
  /** What is new for this manager (`cmsHighlights`). */
  highlights: Highlight[]
  /**
   * The new admin on a wide screen beside the new map on a phone, as one hosted
   * image (`public/emails/atlas-migration-banner.jpg`): email clients render no
   * SVG and Outlook drops CSS backgrounds, so the composition is baked in.
   */
  bannerUrl: string
}

/** One line of what is new: an emoji (email clients render no SVG), a bold lead, the rest. */
export interface Highlight {
  icon: string
  title: string
  text: string
}

export const ATLAS_MIGRATION_SUBJECT = 'Welcome to the new Sahaj Atlas'

/** What changed on the public map, for everyone. */
export const MAP_HIGHLIGHTS: Highlight[] = [
  {
    icon: '🔍',
    title: 'Search filters',
    text: 'by language, time of day, day of the week, location and more.',
  },
  {
    icon: '📅',
    title: 'A calendar view,',
    text: 'and people who register can add the class to their calendar and get a reminder.',
  },
  {
    icon: '🔗',
    title: 'Easy sharing.',
    text: 'Visitors can share a class with friends in one tap.',
  },
  { icon: '🌸', title: 'A fresh new look', text: 'that is clean and polished.' },
  { icon: '📱', title: 'Easier on phones', text: 'wherever people find your classes.' },
  { icon: '🛠️', title: 'And much more:', text: 'many small improvements and bug fixes!' },
]

/** What changed for this manager, by what they look after. */
export function cmsHighlights(holds: {
  events: number
  regions: number
  services: number
}): Highlight[] {
  const region = holds.regions > 0
  return [
    {
      icon: '👀',
      title: 'Live preview.',
      text: 'See exactly how a class will look on the map while you edit it.',
    },
    {
      icon: '🌴',
      title: 'Holiday breaks.',
      text: 'Better class controls, so you can pause a class over the holidays.',
    },
    ...(holds.events > 0
      ? [
          {
            icon: '👥',
            title: 'Your registrations.',
            text: 'See who has signed up for each class, and download the list.',
          },
        ]
      : []),
    {
      icon: '💡',
      title: 'Tips for your listings.',
      text: 'Suggestions for improving your classes, such as images and descriptions.',
    },
    {
      icon: '📊',
      title: 'A simpler dashboard,',
      text: region
        ? 'and summary emails about the classes in your area.'
        : 'and summary emails about your classes.',
    },
    ...(region
      ? [
          {
            icon: '📥',
            title: 'Add classes in bulk',
            text: 'by uploading a spreadsheet.',
          },
        ]
      : []),
    ...(holds.services > 0
      ? [
          {
            icon: '🎨',
            title: 'Your website’s map.',
            text: 'Customise how the map looks on your website, and connect your mailing list.',
          },
        ]
      : []),
    {
      icon: '✨',
      title: 'Easier to use.',
      text: 'A simpler interface. Let us know if anything could be better!',
    },
  ]
}

/**
 * The one-off welcome sent to every active Atlas manager once the final sync
 * lands (`scripts/send-atlas-migration-email.ts`). Written for volunteers, not
 * for technical readers, and it ends on the buttons.
 * shortcut: a one-off for the Atlas cutover, delete it with its script once it has gone out.
 */
export function AtlasMigrationEmail({
  brand,
  name,
  email,
  responsibilities,
  signInUrl,
  mapUrl,
  highlights,
  bannerUrl,
}: AtlasMigrationEmailProps) {
  // One spelling of the admin host: a second in the prose would name one host
  // and link another the day either moves.
  const admin = URL.parse(signInUrl)
  return (
    <EmailLayout
      brand={brand}
      heading={ATLAS_MIGRATION_SUBJECT}
      previewText="Your classes have moved to the new Sahaj Atlas. Here is what's new."
    >
      <Img
        src={bannerUrl}
        alt="The new Sahaj Atlas: editing a class beside its live preview, and the new map on a phone"
        width="560"
        style={banner}
      />
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        We have finally finished a major update to the Sahaj Atlas, and created a new interface for
        both yogis and seekers to manage and find public programs worldwide. All data has already
        been transferred.
      </Text>
      <Section style={{ margin: '0 0 16px' }}>
        <Row>
          <Column style={bulletCell}>•</Column>
          <Column style={textCell}>
            Please{' '}
            <Link href={`mailto:${CONTACT_EMAIL}`} style={{ color: brand.colors.primary }}>
              contact us
            </Link>{' '}
            if you need help.
          </Column>
        </Row>
        <Row>
          <Column style={bulletCell}>•</Column>
          <Column style={textCell}>
            From now on you can edit programs at{' '}
            <Link href={admin?.origin ?? signInUrl} style={{ color: brand.colors.primary }}>
              {admin?.host ?? signInUrl}
            </Link>
            .
          </Column>
        </Row>
      </Section>

      <SectionHeading>What you look after</SectionHeading>
      <ResponsibilityRows brand={brand} responsibilities={responsibilities} />

      <SectionHeading>What&apos;s new for you</SectionHeading>
      <HighlightList items={highlights} />

      <SectionHeading>What&apos;s new on the map</SectionHeading>
      <HighlightList items={MAP_HIGHLIGHTS} />

      <Text style={styles.paragraph}>
        To sign in, enter <strong>{email}</strong> and we will email you a link.
      </Text>
      <BrandButtonRow
        brand={brand}
        buttons={[
          { href: signInUrl, label: 'Manage your classes' },
          { href: mapUrl, label: 'See the new map', variant: 'secondary' },
        ]}
      />
    </EmailLayout>
  )
}

/** A table, not a list: Outlook indents and spaces a `<ul>` its own way. */
function HighlightList({ items }: { items: Highlight[] }) {
  return (
    <Section style={{ margin: '0 0 16px' }}>
      {items.map((item) => (
        <Row key={item.title}>
          <Column style={iconCell}>{item.icon}</Column>
          <Column style={textCell}>
            <strong>{item.title}</strong> {item.text}
          </Column>
        </Row>
      ))}
    </Section>
  )
}

const banner = {
  display: 'block',
  width: '100%',
  maxWidth: '560px',
  height: 'auto',
  margin: '0 0 24px',
  borderRadius: '8px',
}
const bulletCell = { width: '20px', fontSize: '16px', verticalAlign: 'top', padding: '2px 0' }
const iconCell = { width: '32px', fontSize: '18px', verticalAlign: 'top', padding: '4px 0' }
const textCell = { fontSize: '16px', lineHeight: '24px', verticalAlign: 'top', padding: '4px 0' }
