import { Hr, Link, Text } from '@react-email/components'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, EmailLayout, styles } from './EmailLayout'

interface ResetPasswordEmailProps {
  /** Recipient display name (falls back to email upstream). */
  name: string
  /** Absolute password-reset URL. */
  resetUrl: string
  /** Project to brand the email for. Defaults to `wemeditate-web`. */
  project?: ProjectSlug
}

/** Password-reset message for the Managers auth flow (replaces Payload's default). */
export function ResetPasswordEmail({
  name,
  resetUrl,
  project = 'wemeditate-web',
}: ResetPasswordEmailProps) {
  const brand = getEmailBrand(project)

  return (
    <EmailLayout
      brand={brand}
      heading="Reset Your Password"
      previewText={`Reset the password for your ${brand.productName} account.`}
    >
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        We received a request to reset the password for your {brand.productName} account. Click the
        button below to choose a new password:
      </Text>
      <BrandButton href={resetUrl} brand={brand}>
        Reset Password
      </BrandButton>
      <Text style={styles.hint}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
        <br />
        <Link href={resetUrl} style={{ ...styles.link, color: brand.colors.primary }}>
          {resetUrl}
        </Link>
      </Text>
      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        If you didn&apos;t request a password reset, you can safely ignore this email — your
        password won&apos;t change.
      </Text>
    </EmailLayout>
  )
}
