'use client'

import type { StaticLabel } from 'payload'

import {
  Button,
  CheckboxInput,
  ConfirmationModal,
  Pill,
  Table,
  toast,
  useConfig,
  useModal,
} from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { FieldShell } from '../FieldShell'
import { tableColumn } from '../helpers/tableColumn'

import './styles.css'

export type ResultStatus = 'draft' | 'duplicate' | 'error' | 'published' | 'removed'

export interface ResultRow {
  row: number
  status: ResultStatus
  eventId?: number
  title: string
  city: string
  notes: string
  reasons?: string[]
  values?: Record<string, string>
}

const STATUS_LABEL: Record<ResultStatus, string> = {
  published: 'Published',
  draft: 'Created',
  duplicate: 'Duplicate',
  error: 'Error',
  removed: 'Removed',
}

const STATUS_PILL: Record<ResultStatus, React.ComponentProps<typeof Pill>['pillStyle']> = {
  published: 'success',
  draft: 'light',
  duplicate: 'warning',
  error: 'error',
  removed: 'light-gray',
}

const PUBLISH_MODAL = 'event-import-publish'
const CLEAN_UP_MODAL = 'event-import-clean-up'

/**
 * Every row of an import, coloured by what became of it, with the created
 * drafts' checkboxes driving the two bulk actions: publish the checked ones,
 * delete the unchecked ones. Both go through the REST API as the signed-in
 * manager, so their own access to each class decides what is allowed.
 *
 * ⚠ **The colour rides on the row's `data-id`** (`styles.css`), the one per-row
 * hook Payload's `Table` renders, which is why each row's id leads with its
 * status.
 */
export const ImportResultsTable: React.FC<{
  description: string
  importId: number | string
  label: StaticLabel | undefined
  path: string
  rows: ResultRow[]
}> = ({ description, importId, label, path, rows }) => {
  const { config } = useConfig()
  const { openModal } = useModal()
  const router = useRouter()
  const api = `${config.serverURL}${config.routes.api}`
  const admin = config.routes.admin

  const drafts = useMemo(
    () => rows.flatMap(({ eventId, status }) => (status === 'draft' && eventId ? [eventId] : [])),
    [rows],
  )
  const [checked, setChecked] = useState<Set<number>>(() => new Set(drafts))
  const toPublish = drafts.filter((id) => checked.has(id))
  const toDelete = drafts.filter((id) => !checked.has(id))
  const skipped = rows.filter(({ status }) => status === 'duplicate' || status === 'error')

  const toggle = (id: number) =>
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () =>
    setChecked(toPublish.length === drafts.length ? new Set() : new Set(drafts))

  /** Only drafts this import created: a stale page can never touch anything else. */
  const where = (ids: readonly number[]) =>
    `where[and][0][id][in]=${ids.join(',')}&where[and][1][importBatch][equals]=${importId}&where[and][2][_status][equals]=draft`

  const act = async (method: 'DELETE' | 'PATCH', ids: readonly number[], done: string) => {
    const response = await fetch(`${api}/events?${where(ids)}&depth=0`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'PATCH' ? { body: JSON.stringify({ _status: 'published' }) } : {}),
    })
    const body = (await response.json().catch(() => ({}))) as {
      docs?: unknown[]
      errors?: { message?: string }[]
    }
    const succeeded = body.docs?.length ?? 0
    if (succeeded) toast.success(`${succeeded} ${succeeded === 1 ? 'class' : 'classes'} ${done}.`)
    for (const error of body.errors ?? []) toast.error(error.message ?? 'A class could not be changed.')
    if (!response.ok && !body.errors?.length) toast.error('The change could not be made.')
    router.refresh()
  }

  const download = async () => {
    const { SKIPPED_CSV_FILENAME, skippedRowsCsv } = await import(
      '@/plugins/eventImport/csv/skippedCsv'
    )
    const csv = skippedRowsCsv(
      skipped.map(({ row, reasons, values }) => ({
        row,
        reasons: reasons ?? [],
        values: values ?? {},
      })),
    )
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = SKIPPED_CSV_FILENAME
    link.click()
    URL.revokeObjectURL(url)
  }

  const plural = (count: number) => `${count} draft ${count === 1 ? 'class' : 'classes'}`

  return (
    <FieldShell
      description={description}
      label={label}
      path={path}
      readOnly
      wrapClassName="event-import__stack event-import__results"
    >
      {drafts.length ? (
        <div className="event-import__actions">
          <Button disabled={!toPublish.length} onClick={() => openModal(PUBLISH_MODAL)}>
            {`Publish (${toPublish.length})`}
          </Button>
          <Button
            buttonStyle="secondary"
            disabled={!toDelete.length}
            onClick={() => openModal(CLEAN_UP_MODAL)}
          >
            {`Clean Up (${toDelete.length})`}
          </Button>
        </div>
      ) : null}
      <Table
        appearance="condensed"
        columns={[
          tableColumn(
            'select',
            drafts.length ? (
              <CheckboxInput
                checked={toPublish.length === drafts.length}
                onToggle={toggleAll}
                partialChecked={toPublish.length > 0 && toPublish.length < drafts.length}
              />
            ) : (
              ''
            ),
            rows.map(({ eventId, status }) =>
              status === 'draft' && eventId ? (
                <CheckboxInput
                  checked={checked.has(eventId)}
                  key={eventId}
                  onToggle={() => toggle(eventId)}
                />
              ) : null,
            ),
          ),
          tableColumn(
            'row',
            'Row',
            rows.map(({ row }) => row),
          ),
          tableColumn(
            'title',
            'Title',
            rows.map(({ eventId, title }) =>
              eventId ? (
                <a href={`${admin}/collections/events/${eventId}`} key={eventId}>
                  {title || 'Untitled'}
                </a>
              ) : (
                title || '—'
              ),
            ),
          ),
          tableColumn(
            'city',
            'City',
            rows.map(({ city }) => city || '—'),
          ),
          tableColumn(
            'status',
            'Status',
            rows.map(({ row, status }) => (
              <Pill key={row} pillStyle={STATUS_PILL[status]} size="small">
                {STATUS_LABEL[status]}
              </Pill>
            )),
          ),
          tableColumn(
            'notes',
            'Notes',
            rows.map(({ notes }) => notes),
          ),
        ]}
        data={rows.map(({ row, status }) => ({ id: `${status}-${row}` }))}
      />
      {skipped.length ? (
        <Button buttonStyle="secondary" onClick={() => void download()} size="small">
          {`Download the ${skipped.length} skipped ${skipped.length === 1 ? 'row' : 'rows'} to fix`}
        </Button>
      ) : null}
      <ConfirmationModal
        body={`Publish ${plural(toPublish.length)}? They appear in the Atlas straight away.`}
        confirmLabel={`Publish (${toPublish.length})`}
        heading="Publish classes"
        modalSlug={PUBLISH_MODAL}
        onConfirm={() => act('PATCH', toPublish, 'published')}
      />
      <ConfirmationModal
        body={`Delete ${plural(toDelete.length)} that ${
          toDelete.length === 1 ? 'is' : 'are'
        } not ticked? This cannot be undone.`}
        confirmLabel={`Clean Up (${toDelete.length})`}
        heading="Clean up drafts"
        modalSlug={CLEAN_UP_MODAL}
        onConfirm={() => act('DELETE', toDelete, 'deleted')}
      />
    </FieldShell>
  )
}
