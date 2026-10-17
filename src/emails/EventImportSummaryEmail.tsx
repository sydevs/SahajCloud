import { Hr, Section, Text } from 'react-email'

import type { EmailBrand } from '@/plugins/email'

import { BrandButtonRow, DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

/** What one committed batch added, and what it left out. */
export interface EventImportSummaryCounts {
  /** Classes created with a coordinator vouching for them. */
  verified: number
  /** Classes created with nobody vouching for them: published, and `unverified`. */
  unverified: number
  /** Rows skipped as a repeat of an existing or an earlier class. */
  duplicates: number
  /** Rows skipped because something about them could not be resolved. */
  errors: number
  /** Regions the import added under the target. */
  regionsAdded: number
  /** Coordinator accounts the batch named. */
  coordinators: number
  /** How many of those accounts this import created. */
  coordinatorsCreated: number
}

/** One line the import created nothing for, as the report lists it. */
export interface EventImportSkippedLine {
  line: number
  reasons: string[]
}

interface EventImportSummaryEmailProps {
  brand: EmailBrand
  /** The volunteer whose file this was. */
  uploaderName: string
  /** The region the batch was imported into. */
  targetName: string
  counts: EventImportSummaryCounts
  /** Every line the import created nothing for. */
  skipped?: readonly EventImportSkippedLine[]
  /** The batch's own admin page, which holds the rows and the skipped-rows download. */
  batchUrl: string
  /** The events list, filtered to the stage an uncoordinated import lands on. */
  unverifiedUrl: string
}

/**
 * How many skipped lines this lists before pointing at the batch page.
 *
 * The batch holds every one of them, and its own screen downloads them as a CSV
 * — so a 400-line list here would be a worse copy of a page one click away.
 */
const MAX_LISTED_LINES = 20

/**
 * The report that a bulk import committed — to the uploader, with every admin
 * copied.
 *
 * ⚠ **One mail, not two.** #874 sent the volunteer a report with the skipped
 * rows attached and the admins a separate notice. The batch now survives the
 * commit until the retention sweep, so the skipped rows are a download on its
 * own page and the only thing an attachment added was a copy of contact details
 * in everybody's inbox.
 *
 * Informational, not an alert: nothing here needs doing.
 */
export function EventImportSummaryEmail({
  brand,
  uploaderName,
  targetName,
  counts,
  skipped: skippedLines = [],
  batchUrl,
  unverifiedUrl,
}: EventImportSummaryEmailProps) {
  const created = counts.verified + counts.unverified
  // ⚠ **Never summed.** A row can carry both a duplicate match and an error, so
  // `duplicates + errors` over-counts the lines — the two counts are shown side
  // by side, and `skipped.length` is what says how many lines there were.
  const anySkipped = counts.duplicates > 0 || counts.errors > 0
  const shown = skippedLines.slice(0, MAX_LISTED_LINES)

  return (
    <EmailLayout
      brand={brand}
      heading="Your class import is finished"
      previewText={`${created} ${created === 1 ? 'class' : 'classes'} imported into ${targetName}`}
    >
      <Text style={styles.paragraph}>
        <strong>{uploaderName}</strong> imported {created} {created === 1 ? 'class' : 'classes'}{' '}
        into <strong>{targetName}</strong>.
      </Text>

      <Section>
        <SectionHeading>Classes created</SectionHeading>
        <DetailRow label="With a coordinator">{counts.verified}</DetailRow>
        <DetailRow label="Unverified">{counts.unverified}</DetailRow>
      </Section>

      {anySkipped ? (
        <Section>
          <SectionHeading>Rows skipped</SectionHeading>
          {counts.duplicates > 0 ? (
            <DetailRow label="Duplicates">{counts.duplicates}</DetailRow>
          ) : null}
          {counts.errors > 0 ? <DetailRow label="With errors">{counts.errors}</DetailRow> : null}
        </Section>
      ) : null}

      {shown.length ? (
        <Section>
          <SectionHeading>Skipped lines</SectionHeading>
          {shown.map(({ line, reasons }) => (
            <DetailRow key={line} label={`Line ${line}`}>
              {reasons.join('; ')}
            </DetailRow>
          ))}
          <Text style={styles.paragraph}>
            {skippedLines.length > shown.length
              ? `…and ${skippedLines.length - shown.length} more. `
              : ''}
            The import page lists every skipped line and downloads them as a file to fix and upload
            again.
          </Text>
        </Section>
      ) : null}

      <Section>
        <SectionHeading>Also added</SectionHeading>
        <DetailRow label="Regions">{counts.regionsAdded}</DetailRow>
        <DetailRow label="Coordinators named">
          {counts.coordinators}
          {counts.coordinatorsCreated > 0
            ? ` (${counts.coordinatorsCreated} new account${
                counts.coordinatorsCreated === 1 ? '' : 's'
              })`
            : ''}
        </DetailRow>
      </Section>

      <BrandButtonRow
        brand={brand}
        buttons={[
          { href: batchUrl, label: 'View the import' },
          { href: unverifiedUrl, label: 'Unverified classes', variant: 'secondary' },
        ]}
      />

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        You’re receiving this because you imported classes into {brand.productName}, or because you
        administer it.
      </Text>
    </EmailLayout>
  )
}
