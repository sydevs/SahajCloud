'use client'

import type { JSONFieldClientComponent } from 'payload'

import { Banner, Button, useField, useFormFields } from '@payloadcms/ui'

import type { EventImportSkippedRows } from '@/payload-types'

import { FieldShell } from '../FieldShell'

import './styles.css'

/**
 * The outcome of an import, under its plugin-written `summary`: how many draft
 * classes wait for review, and the skipped rows as a CSV built in the browser
 * from this very value — the file a volunteer fixes and uploads again.
 */
export const SkippedRowsDownload: JSONFieldClientComponent = ({ field }) => {
  const { admin, label, name } = field
  const { value } = useField<EventImportSkippedRows>()
  const imported = useFormFields(([fields]) => fields['summary.imported']?.value as number | undefined)
  const importId = useFormFields(([fields]) => fields.id?.value as number | string | undefined)

  const skipped = value ?? []

  const download = async () => {
    const { SKIPPED_CSV_FILENAME, skippedRowsCsv } = await import(
      '@/plugins/eventImport/csv/skippedCsv'
    )
    const blob = new Blob([skippedRowsCsv(skipped)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = SKIPPED_CSV_FILENAME
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <FieldShell
      description={admin?.description}
      label={label}
      path={name}
      readOnly
      wrapClassName="event-import__stack"
    >
      <Banner type="success">
        {`${imported ?? 0} draft ${imported === 1 ? 'class' : 'classes'} waiting for review. `}
        {importId !== undefined ? (
          <a href={`/admin/collections/events?where[importBatch][equals]=${importId}`}>
            Review and publish them
          </a>
        ) : null}
      </Banner>
      {skipped.length ? (
        <>
          <Banner type="info">
            {`${skipped.length} ${skipped.length === 1 ? 'row was' : 'rows were'} skipped.`}
          </Banner>
          <Button buttonStyle="secondary" onClick={() => void download()}>
            Download the skipped rows to fix and upload again
          </Button>
        </>
      ) : (
        <p className="event-import__note">Every row in the file was imported.</p>
      )}
    </FieldShell>
  )
}

export default SkippedRowsDownload
