import type { CSSProperties } from 'react'

import { Fragment } from 'react'
import { Column, Link, Row, Section, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, EmailLayout, NBSP, SectionHeading, styles } from './EmailLayout'

/** One block of tiles, with the heading it sits under. */
export interface DigestTileBlock {
  heading: string
  tiles: { change?: null | string; label: string; of?: null | string; value: string }[]
}

/** Payload's own pill colours, so an email and the home it mirrors read alike. */
const PILL_COLORS = {
  error: { background: '#f7d0cc', text: '#692725' },
  'light-gray': { background: '#ebebeb', text: '#2f2f2f' },
  success: { background: '#bce1f8', text: '#12425a' },
  warning: { background: '#f3d4ba', text: '#5a3713' },
} as const

export type StatusPillStyle = keyof typeof PILL_COLORS

/** One open item: what it is on the left, where it stands on the right. */
export interface ItemTableRow {
  /** The next step's wording, linked to the page that takes it. */
  action?: null | { href: string; label: string }
  href: string
  /** Pills, most urgent first. */
  statuses: { pillStyle: StatusPillStyle; text: string }[]
  /** The most urgent status's line, under the pills. */
  line?: string
  title: string
}

/**
 * One event's new registrants.
 *
 * ⚠ **No other manager's address appears here.** These rows are registrants. A
 * colleague's contact details are theirs to share, and a digest quoting them
 * would copy personal data into every inbox up the chain (#908, #1047).
 */
export interface DigestRegistrationGroup {
  /** The event's Registrations tab (#1069). */
  allUrl: string
  heading: string
  rows: { answers?: string; attending?: null | string; email: string; name: string }[]
}

export interface DigestEmailProps {
  /** The dashboard this role's "Open your dashboard" button opens. */
  dashboardUrl: string
  /** The account page's notifications tab. */
  notificationsUrl: string
  /** Formatted, e.g. "Thursday, 5 November 2026". */
  date: string
  /** What the email is, in the reader's own terms: "Your events". */
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
 * Flat grey tiles in table cells: a flex row collapses in Outlook's Word engine
 * and an inline-block row wraps unpredictably at phone width. The gap is a
 * spacer cell, because Outlook drops a margin on a `<td>`.
 */
function StatTiles({ tiles }: { tiles: DigestTileBlock['tiles'] }) {
  if (tiles.length === 0) return null
  return (
    <Section style={{ margin: '0 0 8px' }}>
      <Row>
        {tiles.map((tile, index) => (
          <Fragment key={tile.label}>
            {index > 0 ? <Column style={tileGap}>{NBSP}</Column> : null}
            <Column style={tileCell}>
              <Text style={tileLabel}>{tile.label}</Text>
              <Text style={tileValue}>
                {tile.value}
                {tile.of ? <span style={tileOf}> of {tile.of}</span> : null}
              </Text>
              {tile.change ? <Text style={tileChange}>{tile.change}</Text> : null}
            </Column>
          </Fragment>
        ))}
      </Row>
    </Section>
  )
}

/**
 * The open-items list in two cells, not a column per fact: a five-column table
 * is unreadable at phone width and an email has no media query it can rely on.
 */
function ItemTable({ accent, rows }: { accent: string; rows: ItemTableRow[] }) {
  if (rows.length === 0) return null
  return (
    <Section style={{ margin: '0 0 8px' }}>
      {rows.map((row) => (
        <Row key={row.href} style={itemRow}>
          <Column style={itemMain}>
            <Link href={row.href} style={{ ...itemTitle, color: accent }}>
              {row.title}
            </Link>
            {row.action ? (
              <Text style={itemAction}>
                <Link href={row.action.href} style={{ color: accent }}>
                  {row.action.label}
                </Link>
              </Text>
            ) : null}
          </Column>
          <Column style={itemSide}>
            {row.statuses.map((status) => (
              <Fragment key={status.text}>
                <span
                  style={{
                    backgroundColor: PILL_COLORS[status.pillStyle].background,
                    borderRadius: '3px',
                    color: PILL_COLORS[status.pillStyle].text,
                    display: 'inline-block',
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {status.text}
                </span>{' '}
              </Fragment>
            ))}
            {row.line ? <Text style={itemLine}>{row.line}</Text> : null}
          </Column>
        </Row>
      ))}
    </Section>
  )
}

/** One event's new registrants: a header row, three columns, and each person's answers below. */
function RegistrationTable({
  accent,
  group: { allUrl, heading, rows },
}: {
  accent: string
  group: DigestRegistrationGroup
}) {
  return (
    <Section style={{ margin: '0 0 14px' }}>
      <Text style={{ ...registrationHeading, color: accent }}>{heading}</Text>
      <Row style={registrationHead}>
        <Column style={registrationHeadCell}>Name</Column>
        <Column style={registrationHeadCell}>Email</Column>
        <Column style={registrationHeadCell}>Attending</Column>
      </Row>
      {rows.map((row, index) => (
        <Fragment key={`${row.email}-${index}`}>
          <Row>
            <Column style={registrationCell}>{row.name}</Column>
            <Column style={registrationCell}>{row.email}</Column>
            <Column style={registrationCell}>{row.attending ?? '—'}</Column>
          </Row>
          {row.answers ? (
            <Row>
              <Column style={registrationAnswers}>{row.answers}</Column>
            </Row>
          ) : null}
        </Fragment>
      ))}
      <Text style={styles.hint}>
        <Link href={allUrl} style={{ color: accent }}>
          All registrations
        </Link>
      </Text>
    </Section>
  )
}

/**
 * One manager's digest for one role: what is open, how it is going, and who
 * signed up.
 *
 * ⚠ **One email per role, and the role is the subject line.** A manager who
 * runs a class, looks after a region and administers the map does three
 * different jobs, and a single email mixing them would make every section
 * somebody else's problem. `ROLE_LABELS` in `buildDigest` names the role; this
 * template takes the words rather than the role.
 *
 * ⚠ **It is email only, and English only.** Every string is an admin-facing
 * label, not visitor copy — `resolveEmailStrings` serves the registrant
 * templates (`docs/rules/email.md`). A section that failed to build is left
 * out, never rendered empty, which is what stops one broken query emptying the
 * email.
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
    <EmailLayout
      brand={brand}
      heading={heading}
      previewText={summary}
      footer={
        <>
          You’re receiving this because of what you look after on {brand.productName}.{' '}
          <Link href={notificationsUrl} style={{ color: accent }}>
            Manage notifications
          </Link>
          .
        </>
      }
    >
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
            <RegistrationTable accent={accent} group={group} key={group.heading} />
          ))}
        </>
      ) : null}

      <BrandButton brand={brand} href={dashboardUrl}>
        Open your dashboard
      </BrandButton>
    </EmailLayout>
  )
}

const tileCell: CSSProperties = {
  backgroundColor: '#f1f2f4',
  padding: '12px 14px',
  verticalAlign: 'top',
}
const tileGap: CSSProperties = { fontSize: '1px', lineHeight: '1px', width: '6px' }
const tileLabel: CSSProperties = {
  color: '#6b7280',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  margin: '0 0 4px',
  textTransform: 'uppercase',
}
const tileValue: CSSProperties = { color: '#111827', fontSize: '22px', fontWeight: 700, margin: 0 }
const tileOf: CSSProperties = { color: '#6b7280', fontSize: '13px', fontWeight: 400 }
const tileChange: CSSProperties = { color: '#6b7280', fontSize: '12px', margin: '4px 0 0' }

const itemRow: CSSProperties = { borderBottom: '1px solid #e5e7eb' }
const itemMain: CSSProperties = { padding: '10px 10px 10px 0', verticalAlign: 'top' }
const itemSide: CSSProperties = {
  padding: '10px 0',
  textAlign: 'right',
  verticalAlign: 'top',
  width: '38%',
}
const itemTitle: CSSProperties = { fontSize: '15px', fontWeight: 600, textDecoration: 'none' }
const itemAction: CSSProperties = { fontSize: '13px', margin: '4px 0 0' }
const itemLine: CSSProperties = { color: '#6b7280', fontSize: '12px', margin: '4px 0 8px' }
const registrationHeading: CSSProperties = { fontSize: '15px', fontWeight: 700, margin: '0 0 6px' }
const registrationHead: CSSProperties = { borderBottom: '1px solid #e5e7eb' }
const registrationHeadCell: CSSProperties = {
  color: '#6b7280',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  padding: '0 8px 4px 0',
  textTransform: 'uppercase',
}
const registrationCell: CSSProperties = {
  color: '#1f2937',
  fontSize: '14px',
  padding: '6px 8px 6px 0',
  verticalAlign: 'top',
}
const registrationAnswers: CSSProperties = {
  color: '#6b7280',
  fontSize: '12px',
  padding: '0 0 8px',
  whiteSpace: 'pre-wrap',
}
