import { Hr, Link, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, EmailLayout, styles } from './EmailLayout'

interface SignInLinkEmailProps {
  /** Recipient display name (falls back to email upstream). */
  name: string
  /** Absolute sign-in URL, carrying the signed token. */
  signInUrl: string
  /** How long the link stays valid, already rendered ("15 minutes"). */
  validFor: string
  /** Project to brand the email for. Defaults to `wemeditate-web`. */
  project?: ProjectSlug
}

/** The emailed sign-in link that trades an address for an admin session. */
export function SignInLinkEmail({
  name,
  signInUrl,
  validFor,
  project = 'wemeditate-web',
}: SignInLinkEmailProps) {
  const brand = getEmailBrand(project)

  return (
    <EmailLayout
      brand={brand}
      heading="Your Sign-In Link"
      previewText={`Sign in to ${brand.productName} — this link is valid for ${validFor}.`}
    >
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        Use the button below to sign in to {brand.productName}. The link is valid for {validFor},
        and it works once.
      </Text>
      <BrandButton href={signInUrl} brand={brand}>
        Sign In
      </BrandButton>
      <Text style={styles.hint}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
        <br />
        <Link href={signInUrl} style={{ ...styles.link, color: brand.colors.primary }}>
          {signInUrl}
        </Link>
      </Text>
      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        If you didn&apos;t ask to sign in, you can safely ignore this email. The link only reaches
        this address.
      </Text>
    </EmailLayout>
  )
}
