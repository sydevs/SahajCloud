import { Hr, Link, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, EmailLayout, styles } from './EmailLayout'

interface VerifyEmailProps {
  /** Recipient display name (falls back to email upstream). */
  name: string
  /** Absolute verification URL. */
  verifyUrl: string
  /** Project to brand the email for. Defaults to `wemeditate-web`. */
  project?: ProjectSlug
}

/** Invitation / email-verification message for the Managers auth flow (managers are invited, never self-registered). */
export function VerifyEmail({ name, verifyUrl, project = 'wemeditate-web' }: VerifyEmailProps) {
  const brand = getEmailBrand(project)

  return (
    <EmailLayout
      brand={brand}
      heading="Verify Your Email Address"
      previewText={`You've been invited to manage content for ${brand.productName} — verify your email to get started.`}
    >
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        You&apos;ve been invited to help manage content for {brand.productName}. To activate your
        account and access the admin panel, please verify your email address using the button below:
      </Text>
      <BrandButton href={verifyUrl} brand={brand}>
        Verify Email Address
      </BrandButton>
      <Text style={styles.hint}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
        <br />
        <Link href={verifyUrl} style={{ ...styles.link, color: brand.colors.primary }}>
          {verifyUrl}
        </Link>
      </Text>
      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        If you weren&apos;t expecting this invitation, you can safely ignore this email.
      </Text>
    </EmailLayout>
  )
}
