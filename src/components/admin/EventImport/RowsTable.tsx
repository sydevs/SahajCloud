'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { Button, FieldLabel, Pill, SelectInput, Table, useField, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

import { tableColumn } from '../tableColumn'
import {
  DUPLICATE_ACTION_OPTIONS,
  duplicateNote,
  needsAttention,
  ROW_STATUS_LABEL,
  rowNotes,
  rowPlace,
  rowStatus,
  rowTitle,
  withDuplicateAction,
  type DuplicateAction,
  type ImportRow,
  type RowStatus,
} from './rowModel'

import './styles.css'

/** Payload's own pill colours, mapped onto what each status means to a reviewer. */
const STATUS_PILL: Record<RowStatus, 'dark' | 'error' | 'light' | 'success' | 'warning'> = {
  committed: 'success',
  duplicate: 'warning',
  error: 'error',
  pending: 'light',
  ready: 'dark',
}

/**
 * The lines of the uploaded file, and what the commit will do with each.
 *
 * ⚠ **The only edit this surface offers is a duplicate's skip-or-import.**
 * `hooks/reviewerEdits.ts` refuses every other delta to `rows`, so a control for
 * anything else would be a control that fails the save. A line that is wrong is
 * fixed in the file and re-uploaded.
 *
 * ⚠ **Editable only while the batch reads `review`.** The status comes from form
 * state rather than from a second read: the jobs own every other stage, and the
 * select has to go read-only the moment `ImportProgress`'s refresh brings a new
 * status in.
 *
 * Payload's own `Table` rather than markup of ours, so this reads as a list view
 * (`docs/rules/admin-ui.md`).
 */
export const RowsTable: FieldClientComponent = ({ field }) => {
  const { label, name } = field as JSONFieldClient
  const { setValue, value } = useField<ImportRow[]>()
  const status = useFormFields(([fields]) => fields.status?.value)
  const [showAll, setShowAll] = useState(false)

  const rows = value ?? []
  const readOnly = status !== 'review'
  const flagged = rows.filter(needsAttention)
  const shown = showAll || !flagged.length ? rows : flagged

  const choose = (line: number, action: DuplicateAction) =>
    setValue(withDuplicateAction(rows, line, action))

  return (
    <div className={`field-type json${readOnly ? ' read-only' : ''}`}>
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap event-import__rows">
        {rows.length === 0 ? (
          <p className="event-import__note">This file holds no lines.</p>
        ) : (
          <>
            <p className="event-import__note">
              {flagged.length
                ? `${flagged.length} of ${rows.length} lines need a look.`
                : `All ${rows.length} lines are ready.`}{' '}
              {flagged.length && flagged.length < rows.length ? (
                <Button buttonStyle="secondary" onClick={() => setShowAll(!showAll)} size="small">
                  {showAll ? 'Show only those' : `Show all ${rows.length}`}
                </Button>
              ) : null}
            </p>
            <Table
              appearance="condensed"
              columns={[
                tableColumn(
                  'line',
                  'Line',
                  shown.map((row) => row.line),
                ),
                tableColumn('title', 'Title', shown.map(rowTitle)),
                tableColumn('place', 'Place', shown.map(rowPlace)),
                tableColumn(
                  'status',
                  'Status',
                  shown.map((row) => (
                    <Pill key={row.line} pillStyle={STATUS_PILL[rowStatus(row)]}>
                      {ROW_STATUS_LABEL[rowStatus(row)]}
                    </Pill>
                  )),
                ),
                tableColumn(
                  'duplicate',
                  'Duplicate',
                  shown.map((row) =>
                    row.duplicate ? (
                      <div className="event-import__duplicate" key={row.line}>
                        <span>{duplicateNote(row)}</span>
                        <SelectInput
                          // Payload keys form state by `path`, and these live
                          // inside one field's own value — so the name is the
                          // control's identity here, never a path to write to.
                          name={`duplicate-${row.line}`}
                          onChange={(option) => {
                            const chosen = Array.isArray(option) ? option[0] : option
                            if (chosen?.value) choose(row.line, chosen.value as DuplicateAction)
                          }}
                          options={[...DUPLICATE_ACTION_OPTIONS]}
                          path={`duplicate-${row.line}`}
                          readOnly={readOnly || !!row.committed}
                          value={row.duplicate.action ?? 'skip'}
                        />
                      </div>
                    ) : (
                      '—'
                    ),
                  ),
                ),
                tableColumn('notes', 'Notes', shown.map(rowNotes)),
              ]}
              data={shown.map((row) => ({ id: row.line }))}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default RowsTable
