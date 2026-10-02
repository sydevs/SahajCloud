import { Hr, Section, Text } from 'react-email'

import type { EmailBrand } from '@/plugins/email'

import { BrandButtonRow, DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

/** What one committed batch added, and what it left out. */
export interface EventImportSummaryCounts {
  /** Classes created with a coordinator vouching for them. */
  verified: number
  /** Classes created with nobody vouching for them. */
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

interface EventImportSummaryEmailProps {
  brand: EmailBrand
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

/**
 * Admin-facing report that a bulk import committed.
 *
 * Informational, not an alert: nothing here needs doing, and the batch is gone
 * by the time it arrives. It is the only notice a bulk import sends, so the
 * counts are the record — the classes themselves carry who imported them, and
 * nothing else does (`src/collections/EventImports/EventImports.ts`).
 */
export function EventImportSummaryEmail({
  brand,
  uploaderName,
  targetName,
  counts,
  targetUrl,
  unverifiedUrl,
}: EventImportSummaryEmailProps) {
  const created = counts.verified + counts.unverified
  const skipped = counts.duplicates + counts.errors

  return (
    <EmailLayout
      brand={brand}
      heading="Bulk import committed"
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

      {skipped > 0 ? (
        <Section>
          <SectionHeading>Rows skipped</SectionHeading>
          {counts.duplicates > 0 ? (
            <DetailRow label="Duplicates">{counts.duplicates}</DetailRow>
          ) : null}
          {counts.errors > 0 ? <DetailRow label="With errors">{counts.errors}</DetailRow> : null}
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
        You’re receiving this because you administer {brand.productName}.
      </Text>
    </EmailLayout>
  )
}
