import { Column, Row, Section, Text } from 'react-email'

import type { EmailBrand } from '@/plugins/email'
import type { Responsibility } from '@/plugins/login/grantSummary'

import { BrandButtonRow, EmailLayout, SectionHeading, styles } from './EmailLayout'
import { ResponsibilityRows } from './InviteEmail'

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
    icon: '📍',
    title: 'Classes nearby.',
    text: 'Visitors are offered the classes closest to them.',
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
      icon: '👀',
      title: 'Live preview.',
      text: 'See exactly how a class will look on the map while you edit it.',
    },
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
}: AtlasMigrationEmailProps) {
  return (
    <EmailLayout
      brand={brand}
      heading={ATLAS_MIGRATION_SUBJECT}
      previewText="Your classes have moved to the new Sahaj Atlas. Here is what's new."
    >
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        Sahaj Atlas has a new home for looking after your classes.{' '}
        <strong>Everything you manage has already been moved across for you.</strong>
      </Text>

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

const iconCell = { width: '32px', fontSize: '18px', verticalAlign: 'top', padding: '4px 0' }
const textCell = { fontSize: '16px', lineHeight: '24px', verticalAlign: 'top', padding: '4px 0' }
