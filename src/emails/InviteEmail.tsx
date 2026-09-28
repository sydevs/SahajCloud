import { Fragment } from 'react'
import { Hr, Link, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'
import type { LocaleGrant, Responsibility } from '@/plugins/login/grantSummary'

import { BrandButton, DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

interface InviteEmailProps {
  /** Recipient display name (falls back to email upstream). */
  name: string
  /**
   * Whether the recipient has accepted before. An accepted manager is told what
   * is new and pointed at the admin; everyone else gets an invitation to accept.
   */
  accepted: boolean
  /** The button's target: the invitation link, or the admin for an accepted manager. */
  actionUrl: string
  /** How long the invitation stays valid, already rendered ("7 days"). */
  validFor: string
  /** Who assigned it, when a person did — named in the opening line. */
  assignedBy?: string
  /** An admin holds every permission in every locale, so no role list applies. */
  fullAccess: boolean
  /** Role labels per locale, most roles first. */
  grants: LocaleGrant[]
  /** The regions, events and pages this invitation is about. */
  responsibilities: Responsibility[]
  /** Project to brand the email for. Defaults to `wemeditate-web`. */
  project?: ProjectSlug
}

/**
 * What a manager who has never heard of a project needs before anything else.
 * A project without one is introduced by its name alone.
 */
const PROJECT_INTROS: Partial<Record<ProjectSlug, string>> = {
  'sahaj-atlas':
    'Sahaj Atlas is a worldwide map of free Sahaja Yoga meditation classes. Seekers find a class near them on sahajatlas.com and on local Sahaj websites. As a manager you keep your classes’ times and details accurate, so everyone who turns up finds a class that’s really running.',
}

/** The admin's own name, as its browser tab spells it (`payload.config.ts`). */
const ADMIN_NAME = 'Sahaj Cloud'

/**
 * An invitation to look after what a manager was just assigned — or, for an
 * account that has never accepted, everything it holds.
 *
 * It is framed around the assignment, not the platform: the heading names what
 * to look after, and the opening line names who asked.
 */
export function InviteEmail({
  name,
  accepted,
  actionUrl,
  validFor,
  assignedBy,
  fullAccess,
  grants,
  responsibilities,
  project = 'wemeditate-web',
}: InviteEmailProps) {
  const brand = getEmailBrand(project)
  const heading = inviteHeading({ grants, responsibilities }, brand.productName)
  const intro = PROJECT_INTROS[project]
  const who = assignedBy ? `${assignedBy} has invited you` : 'You’ve been invited'
  const task = responsibilities.length > 0 ? 'look after the following on' : 'help with'

  return (
    <EmailLayout brand={brand} heading={heading} previewText={`${heading}.`}>
      <Text style={styles.paragraph}>
        Hello <strong>{name}</strong>,
      </Text>
      <Text style={styles.paragraph}>
        {`${who} to ${task} ${brand.productName}.`}
        {accepted
          ? null
          : ' Accept the invitation below to set up your account — there is no password to choose.'}
      </Text>
      {intro ? <Text style={styles.hint}>{intro}</Text> : null}

      {fullAccess ? (
        <>
          <SectionHeading>Your access</SectionHeading>
          <Text style={styles.paragraph}>
            Administrator — full access to every language and every collection.
          </Text>
        </>
      ) : grants.length > 0 ? (
        <>
          <SectionHeading>{accepted ? 'Your new roles' : 'Your roles'}</SectionHeading>
          {grants.map((grant) => (
            <DetailRow key={grant.locale} label={grant.locale}>
              {grant.roles.join(', ')}
            </DetailRow>
          ))}
        </>
      ) : null}

      {responsibilities.length > 0 ? (
        <>
          <SectionHeading>
            {accepted ? 'Your new responsibilities' : 'Your responsibilities'}
          </SectionHeading>
          {responsibilities.map(({ items, label }) => (
            <DetailRow key={label} label={label}>
              {items.map((item, index) => (
                <Fragment key={index}>
                  {index > 0 ? <br /> : null}
                  {item.url ? (
                    <Link href={item.url} style={{ color: brand.colors.primary }}>
                      {item.title}
                    </Link>
                  ) : (
                    <>
                      {item.title}
                      <span style={notYetPublic}> (Not yet public)</span>
                    </>
                  )}
                </Fragment>
              ))}
            </DetailRow>
          ))}
        </>
      ) : null}

      <BrandButton href={actionUrl} brand={brand}>
        {accepted ? `Open ${ADMIN_NAME}` : 'Accept invitation'}
      </BrandButton>
      {accepted ? null : (
        <Text style={styles.hint}>
          If the button doesn&apos;t work, copy and paste this link into your browser:
          <br />
          <Link href={actionUrl} style={{ ...styles.link, color: brand.colors.primary }}>
            {actionUrl}
          </Link>
        </Text>
      )}
      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        {accepted
          ? `You're receiving this because you manage content on ${brand.productName}. You can turn these emails off under Notification Preferences on your ${ADMIN_NAME} account.`
          : `The invitation is valid for ${validFor}. If you weren't expecting it, you can safely ignore this email.`}
      </Text>
    </EmailLayout>
  )
}

const notYetPublic = { fontSize: '12px', color: '#6b7280', fontStyle: 'italic' as const }

/**
 * The invitation's heading, which is also its subject: what to look after.
 *
 * One document is named outright; one kind is counted ("3 events"); several
 * kinds are counted each ("1 region and 4 events"). An invitation with roles
 * and nothing to look after names the role instead, or the product when there
 * are several.
 */
export function inviteHeading(
  { grants, responsibilities }: { grants: LocaleGrant[]; responsibilities: Responsibility[] },
  productName: string,
): string {
  const counts = responsibilities.map(({ items, label, singular }) =>
    items.length === 1 ? `1 ${singular.toLowerCase()}` : `${items.length} ${label.toLowerCase()}`,
  )
  const total = responsibilities.reduce((sum, { items }) => sum + items.length, 0)

  if (total === 1)
    return `You've been invited to look after ${responsibilities[0]!.items[0]!.title}`
  if (total > 1) return `You've been invited to look after ${joinList(counts)}`

  const roles = new Set(grants.flatMap((grant) => grant.roles))
  return roles.size === 1
    ? `You've been invited to help as ${[...roles][0]}`
    : `You've been invited to help with ${productName}`
}

/** "a", "a and b", "a, b and c". */
function joinList(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]!
}
