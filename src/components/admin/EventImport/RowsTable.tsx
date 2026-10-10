'use client'

import type { JSONFieldClientComponent } from 'payload'

import { Button, Pill, SelectInput, Table, useField } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

import { duplicateMatchNote, type CommitRow } from '@/collections/EventImports/commit/rows'

import { tableColumn } from '../tableColumn'
import { FieldShell, useBatchReadOnly } from './FieldShell'
import {
  DUPLICATE_ACTION_OPTIONS,
  duplicateActionLabel,
  needsAttention,
  ROW_STATUS_LABEL,
  rowNotes,
  rowPlace,
  rowStatus,
  rowTitle,
  withDuplicateAction,
  type DuplicateAction,
  type RowStatus,
} from './rowModel'

/** Payload's own pill colours, mapped onto what each status means to a reviewer. */
const STATUS_PILL: Record<RowStatus, React.ComponentProps<typeof Pill>['pillStyle']> = {
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
 * ⚠ **Every refusal reads in the commit's own words** (`commit/rows.ts`), not
 * this component's: the same person downloads the skipped lines minutes later.
 *
 * Payload's own `Table` rather than markup of ours, so this reads as a list view
 * (`docs/rules/admin-ui.md`).
 */
export const RowsTable: JSONFieldClientComponent = ({ field }) => {
  const { admin, label, name } = field
  const { setValue, value } = useField<CommitRow[]>()
  const readOnly = useBatchReadOnly()
  const [showAll, setShowAll] = useState(false)

  // One pass rather than three: `needsAttention` reads the status too, and the
  // whole table re-renders on every duplicate choice. Keyed on `value` and not
  // on a `value ?? []` binding, which is a new array identity every render.
  const decorated = useMemo(
    () => (value ?? []).map((row) => ({ row, status: rowStatus(row), flagged: needsAttention(row) })),
    [value],
  )
  const rows = value ?? []
  const flagged = decorated.filter((entry) => entry.flagged)
  const shown = showAll || !flagged.length ? decorated : flagged

  const choose = (line: number, action: DuplicateAction) =>
    setValue(withDuplicateAction(rows, line, action))

  return (
    <FieldShell
      description={admin?.description}
      label={label}
      path={name}
      readOnly={readOnly}
    >
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
                shown.map(({ row }) => row.line),
              ),
              tableColumn(
                'title',
                'Title',
                shown.map(({ row }) => rowTitle(row)),
              ),
              tableColumn(
                'place',
                'Place',
                shown.map(({ row }) => rowPlace(row)),
              ),
              tableColumn(
                'status',
                'Status',
                shown.map(({ row, status }) => (
                  <Pill key={row.line} pillStyle={STATUS_PILL[status]}>
                    {ROW_STATUS_LABEL[status]}
                  </Pill>
                )),
              ),
              tableColumn(
                'duplicate',
                'Duplicate',
                shown.map(({ row }) =>
                  row.duplicate ? (
                    <div className="event-import__duplicate" key={row.line}>
                      <span>{duplicateMatchNote(row)}</span>
                      {/* A choice nobody can change renders as the word it
                          settled on: mounting react-select read-only costs an
                          instance per matched row to print one label. */}
                      {readOnly || row.committed ? (
                        <span>{duplicateActionLabel(row)}</span>
                      ) : (
                        <SelectInput
                          // These live inside one field's own value, so the name
                          // identifies the control rather than naming a path
                          // Payload keeps form state at.
                          name={`duplicate-${row.line}`}
                          onChange={(option) => {
                            const chosen = Array.isArray(option) ? option[0] : option
                            if (chosen?.value) choose(row.line, chosen.value as DuplicateAction)
                          }}
                          options={[...DUPLICATE_ACTION_OPTIONS]}
                          path={`duplicate-${row.line}`}
                          value={row.duplicate.action ?? 'skip'}
                        />
                      )}
                    </div>
                  ) : (
                    '—'
                  ),
                ),
              ),
              tableColumn(
                'notes',
                'Notes',
                shown.map(({ row }) => rowNotes(row)),
              ),
            ]}
            data={shown.map(({ row }) => ({ id: row.line }))}
          />
        </>
      )}
    </FieldShell>
  )
}

export default RowsTable
