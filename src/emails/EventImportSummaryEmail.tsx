import { Hr, Section, Text } from 'react-email'

import type { EmailBrand } from '@/plugins/email'

import { BrandButtonRow, DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

export interface EventImportSkippedLine {
  row: number
  reasons: string[]
}

interface EventImportSummaryEmailProps {
  brand: EmailBrand
  targetName: string
  imported: number
  skipped?: readonly EventImportSkippedLine[]
  reviewUrl: string
  importUrl: string
}

const MAX_LISTED_ROWS = 20

export function EventImportSummaryEmail({
  brand,
  targetName,
  imported,
  skipped = [],
  reviewUrl,
  importUrl,
}: EventImportSummaryEmailProps) {
  const shown = skipped.slice(0, MAX_LISTED_ROWS)

  return (
    <EmailLayout
      brand={brand}
      heading={imported ? 'Your class import is ready to review' : 'Your class import needs attention'}
      previewText={
        imported
          ? `${imported} ${imported === 1 ? 'class' : 'classes'} ready to review in ${targetName}`
          : `No classes were created in ${targetName}`
      }
    >
      <Text style={styles.paragraph}>
        {imported ? (
          <>
            {imported} {imported === 1 ? 'class is' : 'classes are'} waiting as drafts in{' '}
            <strong>{targetName}</strong>. Open the import, look them over and publish them.
          </>
        ) : (
          <>
            None of the rows could be imported into <strong>{targetName}</strong>. The import page
            says why for each one.
          </>
        )}
      </Text>

      {skipped.length ? (
        <Section>
          <SectionHeading>Rows skipped</SectionHeading>
          {shown.map(({ row, reasons }) => (
            <DetailRow key={row} label={`Row ${row}`}>
              {reasons.join('; ')}
            </DetailRow>
          ))}
          <Text style={styles.paragraph}>
            {skipped.length > shown.length ? `…and ${skipped.length - shown.length} more. ` : ''}
            The import page downloads every skipped row as a file to fix and upload again.
          </Text>
        </Section>
      ) : null}

      <BrandButtonRow
        brand={brand}
        buttons={[
          { href: reviewUrl, label: 'Review the classes' },
          { href: importUrl, label: 'View the import', variant: 'secondary' },
        ]}
      />

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        You’re receiving this because you imported classes into {brand.productName}.
      </Text>
    </EmailLayout>
  )
}
