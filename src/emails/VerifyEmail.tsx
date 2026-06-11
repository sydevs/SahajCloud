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

/** Account email-verification message for the Managers auth flow. */
export function VerifyEmail({ name, verifyUrl, project = 'wemeditate-web' }: VerifyEmailProps) {
  const brand = getEmailBrand(project)

  return (
    <EmailLayout
      brand={brand}
      heading="Verify Your Email Address"
      previewText={`Verify your email to finish setting up your ${brand.productName} account.`}
    >
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        Thank you for creating an account with {brand.productName}. To complete your registration
        and access the admin panel, please verify your email address by clicking the button below:
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
        If you didn&apos;t create this account, you can safely ignore this email.
      </Text>
    </EmailLayout>
  )
}
