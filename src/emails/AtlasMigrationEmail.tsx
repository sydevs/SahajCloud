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
}

export const ATLAS_MIGRATION_SUBJECT = 'Welcome to the new Sahaj Atlas'

const WHATS_NEW = [
  'Sign in with just your email address. There is no password to remember.',
  'Your home page shows what needs your attention.',
  'See who has registered for each of your classes.',
  'Every few months we ask you to confirm your classes are still running. It takes one click.',
  'The new map suggests classes near each visitor, shows online classes in their own time zone, and speaks 10 languages.',
]

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

      <SectionHeading>What&apos;s new</SectionHeading>
      <ul style={list}>
        {WHATS_NEW.map((line) => (
          <li key={line} style={listItem}>
            {line}
          </li>
        ))}
      </ul>

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

const list = { margin: '0 0 16px', paddingLeft: '20px' }
const listItem = { fontSize: '16px', margin: '0 0 8px' }
