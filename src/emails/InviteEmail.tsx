import { Hr, Link, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

interface InviteEmailProps {
  /** Recipient display name (falls back to email upstream). */
  name: string
  /** Absolute invitation URL, carrying the signed token. */
  inviteUrl: string
  /** How long the invitation stays valid, already rendered ("7 days"). */
  validFor: string
  /** An admin holds every permission in every locale, so no role list applies. */
  fullAccess: boolean
  /** Role labels per locale, most roles first. Empty for an admin. */
  grants: { locale: string; roles: string[] }[]
  /** Project to brand the email for. Defaults to `wemeditate-web`. */
  project?: ProjectSlug
}

/**
 * The invitation a newly created manager receives, naming the access granted.
 *
 * ⚠ **A locale with no roles is absent, not an empty row.** `summarizeGrants`
 * drops it, so an empty `grants` beside `fullAccess: false` means the account
 * genuinely grants nothing yet — which the email says outright rather than
 * rendering a blank table an invitee would read as a fault.
 *
 * It names no region and no page: both are join fields, so nothing points at a
 * manager created one instant ago. A resend, sent later, could.
 */
export function InviteEmail({
  name,
  inviteUrl,
  validFor,
  fullAccess,
  grants,
  project = 'wemeditate-web',
}: InviteEmailProps) {
  const brand = getEmailBrand(project)

  return (
    <EmailLayout
      brand={brand}
      heading={`You've been invited to ${brand.productName}`}
      previewText={`Accept your invitation to help manage content for ${brand.productName}.`}
    >
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        You&apos;ve been invited to help manage content for {brand.productName}. Accept the
        invitation below to set up your account — there is no password to choose.
      </Text>

      <SectionHeading>Your access</SectionHeading>
      {fullAccess ? (
        <Text style={styles.paragraph}>
          Administrator — full access to every language and every collection.
        </Text>
      ) : grants.length > 0 ? (
        grants.map((grant) => (
          <DetailRow key={grant.locale} label={grant.locale}>
            {grant.roles.join(', ')}
          </DetailRow>
        ))
      ) : (
        <Text style={styles.paragraph}>
          No roles yet. An administrator assigns them once your account is active.
        </Text>
      )}

      <BrandButton href={inviteUrl} brand={brand}>
        Accept invitation
      </BrandButton>
      <Text style={styles.hint}>
        If the button doesn&apos;t work, copy and paste this link into your browser:
        <br />
        <Link href={inviteUrl} style={{ ...styles.link, color: brand.colors.primary }}>
          {inviteUrl}
        </Link>
      </Text>
      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        The invitation is valid for {validFor}. If you weren&apos;t expecting it, you can safely
        ignore this email.
      </Text>
    </EmailLayout>
  )
}
