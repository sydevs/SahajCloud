'use client'

import type { JSONFieldClientComponent } from 'payload'

import { Banner, Button, Table, useField, useFormFields } from '@payloadcms/ui'

import type { EventImportSkippedRows } from '@/payload-types'

import { FieldShell } from '../FieldShell'
import { tableColumn } from '../helpers/tableColumn'

import './styles.css'

/**
 * What an import produced: the draft classes waiting for review, and every
 * skipped row with the reason it was skipped. The same rows download as a CSV
 * built in the browser from this value — the file a volunteer fixes and
 * uploads again.
 */
export const ImportResults: JSONFieldClientComponent = ({ field }) => {
  const { admin, label, name } = field
  const { value } = useField<EventImportSkippedRows>()
  const imported = useFormFields(([fields]) => fields['summary.imported']?.value as number | undefined)
  const importId = useFormFields(([fields]) => fields.id?.value as number | string | undefined)

  const skipped = value ?? []
  const created = imported ?? 0

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
      {created > 0 ? (
        <Banner type="success">
          {`${created} draft ${created === 1 ? 'class is' : 'classes are'} waiting for review. `}
          {importId !== undefined ? (
            <a href={`/admin/collections/events?where[importBatch][equals]=${importId}`}>
              Review and publish them
            </a>
          ) : null}
        </Banner>
      ) : (
        <Banner type="error">No classes were created from this file.</Banner>
      )}
      {skipped.length ? (
        <>
          <p className="event-import__note">
            {`${skipped.length} ${skipped.length === 1 ? 'row was' : 'rows were'} skipped. Fix ${
              skipped.length === 1 ? 'it' : 'them'
            } in the downloaded file and upload it as a new import.`}
          </p>
          <Table
            appearance="condensed"
            columns={[
              tableColumn(
                'row',
                'Row',
                skipped.map(({ row }) => row),
              ),
              tableColumn(
                'title',
                'Class',
                skipped.map(({ values }) => values.title || '—'),
              ),
              tableColumn(
                'city',
                'City',
                skipped.map(({ values }) => values.city || '—'),
              ),
              tableColumn(
                'reasons',
                'Why it was skipped',
                skipped.map(({ reasons }) => reasons.join('; ')),
              ),
            ]}
            data={skipped.map(({ row }) => ({ id: row }))}
          />
          <Button buttonStyle="secondary" onClick={() => void download()}>
            Download the skipped rows
          </Button>
        </>
      ) : (
        <p className="event-import__note">Every row in the file was imported.</p>
      )}
    </FieldShell>
  )
}

export default ImportResults
