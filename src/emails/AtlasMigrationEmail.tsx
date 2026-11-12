import { Link, Text } from 'react-email'

import type { EmailBrand } from '@/plugins/email'

import { BrandButton, DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

export interface AtlasMigrationEmailProps {
  brand: EmailBrand
  /** Recipient display name (falls back to email upstream). */
  name: string
  /** The address this email goes to, which is the one they sign in with. */
  email: string
  /** The new CMS's sign-in page. */
  signInUrl: string
  /** What they look after after the import. An admin holds everything. */
  holds: { admin: boolean; events: number; regions: number }
}

export const ATLAS_MIGRATION_SUBJECT = 'Sahaj Atlas has moved to a new CMS'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** What the recipient looks after, in words, or null when the import named them on nothing. */
export function describeHoldings(holds: AtlasMigrationEmailProps['holds']): null | string {
  if (holds.admin) return 'Everything — you are an administrator'
  const parts = [
    holds.events ? plural(holds.events, 'class', 'classes') : null,
    holds.regions ? plural(holds.regions, 'region', 'regions') : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' and ') : null
}

/**
 * The one-off announcement sent to every active Atlas manager once the final
 * sync lands (`scripts/send-atlas-migration-email.ts`).
 * shortcut: a one-off for the Atlas cutover, delete it with its script once it has gone out.
 */
export function AtlasMigrationEmail({
  brand,
  name,
  email,
  signInUrl,
  holds,
}: AtlasMigrationEmailProps) {
  const holdings = describeHoldings(holds)

  return (
    <EmailLayout
      brand={brand}
      heading="Sahaj Atlas has a new CMS"
      previewText="Your classes have moved to cloud.sydevelopers.com. Here is how to sign in."
      footer={
        <>
          You are receiving this one-off email because you look after classes on Sahaj Atlas.
          Questions? Just reply to this email.
        </>
      }
    >
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        The Sahaj Atlas CMS has moved. From now on you look after your classes at{' '}
        <strong>cloud.sydevelopers.com</strong>, and the old address, atlas.sydevelopers.com/cms,
        takes you there automatically.
      </Text>
      <Text style={styles.paragraph}>
        Every class, region and registration has been copied across, so there is nothing to
        re-enter.
      </Text>
      {holdings ? <DetailRow label="You look after">{holdings}</DetailRow> : null}

      <SectionHeading>How to sign in</SectionHeading>
      <Text style={styles.paragraph}>
        Open the new CMS with the button below and enter <strong>{email}</strong>, the address this
        email was sent to. We email you a link, and clicking it signs you in. There is no password.
        The first time, that email asks you to confirm your address.
      </Text>
      <BrandButton href={signInUrl} brand={brand}>
        Open the new CMS
      </BrandButton>
      <Text style={styles.hint}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
        <br />
        <Link href={signInUrl} style={{ ...styles.link, color: brand.colors.primary }}>
          {signInUrl}
        </Link>
      </Text>

      <SectionHeading>What&apos;s new</SectionHeading>
      <Text style={styles.paragraph}>
        Your home page lists what needs your attention, and each class shows its registrations on
        its own tab.
      </Text>
      <Text style={styles.paragraph}>
        Every few months we will ask you to confirm each class is still running, so the map stays
        accurate. Confirming takes one click from that email.
      </Text>
      <Text style={styles.paragraph}>
        Some local websites will show the old map for a few more weeks. Registrations made there
        still reach you by email, as they do today.
      </Text>
    </EmailLayout>
  )
}
