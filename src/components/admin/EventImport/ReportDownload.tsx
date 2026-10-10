'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { Banner, Button, FieldLabel, useField } from '@payloadcms/ui'

import { SKIPPED_CSV_FILENAME, skippedRowsCsv } from '@/collections/EventImports/csv/skippedCsv'
import type { EventImportReport } from '@/payload-types'

import './styles.css'

/**
 * What the import came to, and the lines it did not take.
 *
 * ⚠ **The skipped lines download rather than list.** #874 emailed them as an
 * attachment to the uploader and every admin; the batch now outlives its commit,
 * so the file is built here from the stored report and nobody's inbox carries a
 * volunteer's contact data. `csv/skippedCsv.ts` is what both sides of that
 * change share.
 *
 * Renders nothing until the commit writes a report, which is what keeps it off
 * the create form and the review screen.
 */
export const ReportDownload: FieldClientComponent = ({ field }) => {
  const { label, name } = field as JSONFieldClient
  const { value } = useField<EventImportReport>()

  if (!value?.finishedAt) return null

  const committed = value.committed?.length ?? 0
  const skipped = value.skipped ?? []

  const download = () => {
    const blob = new Blob([skippedRowsCsv(skipped)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = SKIPPED_CSV_FILENAME
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap event-import__report">
        <Banner type="success">
          {`${committed} ${committed === 1 ? 'class' : 'classes'} created.`}
        </Banner>
        {skipped.length ? (
          <>
            <Banner type="info">
              {`${skipped.length} ${skipped.length === 1 ? 'line was' : 'lines were'} skipped.`}
            </Banner>
            <Button buttonStyle="secondary" onClick={download}>
              Download the skipped lines to fix and upload again
            </Button>
          </>
        ) : (
          <p className="event-import__note">Every line in the file was imported.</p>
        )}
      </div>
    </div>
  )
}

export default ReportDownload
