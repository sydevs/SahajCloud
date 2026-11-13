import { Text } from 'react-email'

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
  /** An admin looks after everything, so no list applies. */
  fullAccess: boolean
  /** Everything they look after, as an invitation naming all of it would list it. */
  responsibilities: Responsibility[]
  /** The new admin's sign-in page. */
  signInUrl: string
  /** The new public map. */
  mapUrl: string
  /** What is new for this manager (`cmsHighlights`). */
  highlights: string[]
}

export const ATLAS_MIGRATION_SUBJECT = 'Welcome to the new Sahaj Atlas'

/** What changed on the public map, for everyone. */
export const MAP_HIGHLIGHTS = [
  'Full search filters: language, time of day, day of the week, location and more.',
  'A calendar view, and calendar reminders for people who register.',
  'A fresh, polished new look.',
  'Easier to use on phones.',
  'Many more small improvements and bug fixes!',
]

/** What changed for this manager, by what they look after. */
export function cmsHighlights(holds: {
  admin: boolean
  events: number
  regions: number
  services: number
}): string[] {
  const area = holds.admin || holds.regions > 0
  return [
    'Better class controls. You can now set holiday breaks!',
    'Suggestions for improving your class listings, such as images and descriptions.',
    'A hopefully easier interface. Let us know if anything could be better!',
    area
      ? 'A simpler dashboard, and summary emails about the classes in your area.'
      : 'A simpler dashboard, and summary emails about your classes.',
    ...(holds.admin || holds.services > 0
      ? ['You can customise how the map looks on your website.']
      : []),
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
  fullAccess,
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
        Sahaj Atlas has a new home for looking after your classes. Everything you manage has already
        been moved across for you.
      </Text>

      <SectionHeading>{fullAccess ? 'Your access' : 'What you look after'}</SectionHeading>
      {fullAccess ? (
        <Text style={styles.paragraph}>Administrator — you can see and change everything.</Text>
      ) : (
        <ResponsibilityRows brand={brand} responsibilities={responsibilities} />
      )}

      <SectionHeading>What&apos;s new for you</SectionHeading>
      <Bullets lines={highlights} />

      <SectionHeading>What&apos;s new on the map</SectionHeading>
      <Bullets lines={MAP_HIGHLIGHTS} />

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

function Bullets({ lines }: { lines: string[] }) {
  return (
    <ul style={list}>
      {lines.map((line) => (
        <li key={line} style={listItem}>
          {line}
        </li>
      ))}
    </ul>
  )
}

const list = { margin: '0 0 16px', paddingLeft: '20px' }
const listItem = { fontSize: '16px', margin: '0 0 8px' }
