import { Hr, Section, Text } from 'react-email'

import type { EmailBrand } from '@/plugins/email'

import { BrandButtonRow, DetailRow, EmailLayout, styles } from './EmailLayout'

interface EventImportSummaryEmailProps {
  brand: EmailBrand
  targetName: string
  /** Classes created as drafts. */
  created: number
  /** Rows skipped as repeats of a listed class or an earlier row. */
  duplicates: number
  /** Rows skipped for anything else. */
  errors: number
  importUrl: string
}

const classes = (count: number) => `${count} ${count === 1 ? 'class' : 'classes'}`
const rows = (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`

/** The import's outcome in counts, and one link to the import, where the review happens. */
export function EventImportSummaryEmail({
  brand,
  targetName,
  created,
  duplicates,
  errors,
  importUrl,
}: EventImportSummaryEmailProps) {
  return (
    <EmailLayout
      brand={brand}
      heading={
        created ? 'Your class import is ready to review' : 'Your class import needs attention'
      }
      previewText={
        created
          ? `${classes(created)} ready to review in ${targetName}`
          : `No classes were created in ${targetName}`
      }
    >
      <Text style={styles.paragraph}>
        {created
          ? `Your import into ${targetName} has finished. Review the classes it created and publish the ones that are right — nothing is public until you do.`
          : `Your import into ${targetName} has finished, but none of its rows could be imported. The import page says why for each one.`}
      </Text>

      <Section>
        <DetailRow label="Created as drafts">{classes(created)}</DetailRow>
        {duplicates ? <DetailRow label="Duplicates skipped">{rows(duplicates)}</DetailRow> : null}
        {errors ? <DetailRow label="Errors">{rows(errors)}</DetailRow> : null}
      </Section>

      <BrandButtonRow
        brand={brand}
        buttons={[{ href: importUrl, label: created ? 'Review and publish' : 'View the import' }]}
      />

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        You’re receiving this because you imported classes into {brand.productName}.
      </Text>
    </EmailLayout>
  )
}
