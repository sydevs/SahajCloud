import { Hr, Section, Text } from 'react-email'

import type { EmailBrand } from '@/plugins/email'

import { BrandButtonRow, DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

/** What one committed batch added, and what it left out. */
export interface EventImportSummaryCounts {
  /** Existing classes the reviewer chose to overwrite with their row. */
  overwritten: number
  /** Classes created with a coordinator vouching for them (overwritten ones not included). */
  verified: number
  /** Classes created with nobody vouching for them (overwritten ones not included). */
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

/** One line the import created nothing for, as the uploader's copy lists it. */
export interface EventImportSkippedLine {
  line: number
  reasons: string[]
}

interface EventImportSummaryEmailProps {
  brand: EmailBrand
  /**
   * `admin` is the notice every admin gets; `uploader` is the volunteer's own
   * report, which lists each skipped line — the only copy of it they keep once
   * they leave the import screen.
   */
  audience: 'admin' | 'uploader'
  /** The uploader's copy only: what was skipped and why. */
  skipped?: readonly EventImportSkippedLine[]
  /** The volunteer whose file this was, which is not necessarily who ran the commit. */
  uploaderName: string
  /** The region the batch was imported into. */
  targetName: string
  counts: EventImportSummaryCounts
  /** The target region's admin page. */
  targetUrl: string
  /** The events list, filtered to the stage an uncoordinated import lands on. */
  unverifiedUrl: string
}

/** How many skipped lines the uploader's copy lists before pointing at the attachment. */
const MAX_LISTED_LINES = 50

/**
 * The report that a bulk import committed — to every admin, and to the uploader.
 *
 * Informational, not an alert: nothing here needs doing, and the batch is gone
 * by the time it arrives. It is the only notice a bulk import sends, so the
 * counts are the record — the classes themselves carry who imported them, and
 * nothing else does (`src/collections/EventImports/EventImports.ts`).
 */
export function EventImportSummaryEmail({
  audience,
  brand,
  skipped: skippedLines = [],
  uploaderName,
  targetName,
  counts,
  targetUrl,
  unverifiedUrl,
}: EventImportSummaryEmailProps) {
  const created = counts.verified + counts.unverified
  const skipped = counts.duplicates + counts.errors
  const shown = skippedLines.slice(0, MAX_LISTED_LINES)

  return (
    <EmailLayout
      brand={brand}
      heading={audience === 'uploader' ? 'Your import is finished' : 'Bulk import committed'}
      previewText={`${created} ${created === 1 ? 'class' : 'classes'} imported into ${targetName}`}
    >
      <Text style={styles.paragraph}>
        {audience === 'uploader' ? 'You' : <strong>{uploaderName}</strong>} imported {created}{' '}
        {created === 1 ? 'class' : 'classes'} into <strong>{targetName}</strong>
        {counts.overwritten > 0
          ? ` and updated ${counts.overwritten} existing ${counts.overwritten === 1 ? 'class' : 'classes'}`
          : ''}
        .
      </Text>

      <Section>
        <SectionHeading>Classes created</SectionHeading>
        <DetailRow label="With a coordinator">{counts.verified}</DetailRow>
        <DetailRow label="Unverified">{counts.unverified}</DetailRow>
        {counts.overwritten > 0 ? (
          <DetailRow label="Existing classes overwritten">{counts.overwritten}</DetailRow>
        ) : null}
      </Section>

      {skipped > 0 ? (
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
          {skippedLines.length > shown.length ? (
            <Text style={styles.paragraph}>
              …and {skippedLines.length - shown.length} more. Every skipped line is in the attached
              file, ready to fix and upload again.
            </Text>
          ) : (
            <Text style={styles.paragraph}>
              The attached file holds these lines, ready to fix and upload again.
            </Text>
          )}
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
          { href: targetUrl, label: 'View region' },
          { href: unverifiedUrl, label: 'Unverified classes', variant: 'secondary' },
        ]}
      />

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        {audience === 'uploader'
          ? `You’re receiving this because you imported classes into ${brand.productName}.`
          : `You’re receiving this because you administer ${brand.productName}.`}
      </Text>
    </EmailLayout>
  )
}
