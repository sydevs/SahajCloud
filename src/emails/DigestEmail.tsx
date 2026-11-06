import { Hr, Link, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import {
  BrandButton,
  EmailLayout,
  type ItemTableRow,
  ItemTable,
  RegistrationTable,
  type RegistrationTableRow,
  SectionHeading,
  StatTiles,
  styles,
} from './EmailLayout'

/** One block of tiles, with the heading it sits under. */
export interface DigestTileBlock {
  heading: string
  tiles: { change?: null | string; label: string; of?: null | string; value: string }[]
}

/** One event's new registrants. */
export interface DigestRegistrationGroup {
  allUrl: string
  heading: string
  rows: RegistrationTableRow[]
}

export interface DigestEmailProps {
  /** The dashboard this role's "Open your dashboard" button opens. */
  dashboardUrl: string
  /** The account page's notifications tab. */
  notificationsUrl: string
  /** Formatted, e.g. "5 November 2026". */
  date: string
  /** What the email is, in the reader's own terms: "Your programs". */
  heading: string
  /** One line naming each section that is here, in order. */
  summary: string
  /** Statistics, when that pace is due. */
  statistics?: DigestTileBlock[]
  /** Open items, when any are due. */
  openItems?: { rows: ItemTableRow[] }
  /** An admin's closing line: sign-ups filed as spam. */
  closingNote?: null | { href: string; text: string }
  /** New registrations, grouped by event (the program role only). */
  registrations?: DigestRegistrationGroup[]
  recipientName?: null | string
  /** Project to brand for. Defaults to `sahaj-atlas` — these are Atlas roles. */
  project?: ProjectSlug
}

/**
 * One manager's digest for one role: what is open, how it is going, and who
 * signed up.
 *
 * ⚠ **One email per role, and the role is the subject line.** A manager who
 * runs a class, looks after a region and administers the map does three
 * different jobs, and a single email mixing them would make every section
 * somebody else's problem. `MANAGER_ROLE_LABELS` names the role; this template
 * takes the words rather than the role, so nothing here has to know how many
 * there are.
 *
 * ⚠ **It is email only, and English only.** Every string is an admin-facing
 * label, not visitor copy — `resolveEmailStrings` serves the registrant
 * templates, and a manager's own language is a ticket of its own
 * (`docs/rules/email.md`). A section that failed to build is left out, never
 * rendered empty, which is what stops one broken query emptying the email.
 */
export function DigestEmail({
  closingNote,
  dashboardUrl,
  date,
  heading,
  notificationsUrl,
  openItems,
  project = 'sahaj-atlas',
  recipientName,
  registrations,
  statistics,
  summary,
}: DigestEmailProps) {
  const brand = getEmailBrand(project)
  const accent = brand.colors.primary

  return (
    <EmailLayout brand={brand} heading={heading} previewText={summary}>
      <Text style={styles.hint}>{date}</Text>
      <Text style={styles.paragraph}>
        Hello {recipientName ? <strong>{recipientName}</strong> : 'there'}, {summary}.
      </Text>

      {statistics?.map((block) => (
        <div key={block.heading}>
          <SectionHeading>{block.heading}</SectionHeading>
          <StatTiles tiles={block.tiles} />
        </div>
      ))}

      {openItems ? (
        <>
          <SectionHeading>Open items</SectionHeading>
          <ItemTable accent={accent} rows={openItems.rows} />
          {closingNote ? (
            <Text style={styles.hint}>
              {closingNote.text}{' '}
              <Link href={closingNote.href} style={{ color: accent }}>
                View
              </Link>
            </Text>
          ) : null}
        </>
      ) : null}

      {registrations?.length ? (
        <>
          <SectionHeading>New registrations</SectionHeading>
          {registrations.map((group) => (
            <RegistrationTable
              accent={accent}
              allUrl={group.allUrl}
              heading={group.heading}
              key={group.heading}
              rows={group.rows}
            />
          ))}
        </>
      ) : null}

      <BrandButton brand={brand} href={dashboardUrl}>
        Open your dashboard
      </BrandButton>

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        You’re receiving this because of what you look after on {brand.productName}.{' '}
        <Link href={notificationsUrl} style={{ color: accent }}>
          Manage notifications
        </Link>
        .
      </Text>
    </EmailLayout>
  )
}

/**
 * Plain-text alternative. Beside the component so the two cannot drift, and
 * sent with every digest — a message with no text part scores worse with spam
 * filters and renders as nothing in a text-only client.
 */
export function digestEmailText(props: DigestEmailProps): string {
  const lines: string[] = [
    props.heading,
    props.date,
    '',
    `Hello ${props.recipientName ?? 'there'}, ${props.summary}.`,
  ]

  for (const block of props.statistics ?? []) {
    lines.push('', block.heading.toUpperCase())
    for (const tile of block.tiles) {
      const of = tile.of ? ` of ${tile.of}` : ''
      const change = tile.change ? ` (${tile.change})` : ''
      lines.push(`- ${tile.label}: ${tile.value}${of}${change}`)
    }
  }

  if (props.openItems) {
    lines.push('', 'OPEN ITEMS')
    for (const row of props.openItems.rows) {
      const statuses = row.statuses
        .map((status) => (status.line ? `${status.text} — ${status.line}` : status.text))
        .join('; ')
      lines.push(`- ${row.title}: ${statuses}`)
      if (row.action) lines.push(`    ${row.action.label}: ${row.action.href}`)
    }
    if (props.closingNote) lines.push(`${props.closingNote.text} ${props.closingNote.href}`)
  }

  for (const group of props.registrations ?? []) {
    lines.push('', group.heading)
    for (const row of group.rows) {
      const attending = row.attending ? ` · Attending ${row.attending}` : ''
      lines.push(`- ${row.name} — ${row.email}${attending}`)
      if (row.answers) lines.push(`    ${row.answers}`)
    }
    lines.push(`All registrations: ${group.allUrl}`)
  }

  lines.push('', `Open your dashboard: ${props.dashboardUrl}`)
  lines.push(`Manage notifications: ${props.notificationsUrl}`)
  return lines.join('\n')
}
