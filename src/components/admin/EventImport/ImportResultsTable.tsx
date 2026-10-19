'use client'

import type { StaticLabel } from 'payload'

import {
  Button,
  CheckboxInput,
  ConfirmationModal,
  FieldDescription,
  FieldLabel,
  Table,
  toast,
  useConfig,
  useDocumentDrawer,
  useModal,
  useTranslation,
} from '@payloadcms/ui'
import { formatDate } from '@payloadcms/ui/shared'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { tableColumn } from '../helpers/tableColumn'

import './styles.css'

export type ResultStatus = 'draft' | 'duplicate' | 'error' | 'published' | 'removed'

export interface ResultRow {
  row: number
  status: ResultStatus
  eventId?: number
  title: string
  city: string
  /** When the class was created (a draft) or first published, as ISO. */
  at: null | string
  /** Why a row failed, for `error`. */
  error?: string
  /** The class a `duplicate` row repeats. */
  original?: { id: number; title: string }
  reasons?: string[]
  values?: Record<string, string>
}

const PUBLISH_MODAL = 'event-import-publish'
const CLEAN_UP_MODAL = 'event-import-clean-up'

/**
 * Every row of an import, coloured by what became of it. The created drafts'
 * checkboxes drive the toolbar: publish the ticked ones, delete the unticked
 * ones. Both go through the REST API as the signed-in manager, so their own
 * access to each class decides what is allowed.
 *
 * ⚠ **Not Payload's `RelationshipTable`.** That table lists one collection's
 * documents, and half these rows — the skipped ones — never became a document.
 * The pieces are Payload's own: `Table`, `CheckboxInput`, pill `Button`s laid
 * out like that table's header, `ConfirmationModal`, and the document drawer.
 *
 * ⚠ **The row colour rides on the row's `data-id`** (`styles.css`), the one
 * per-row hook Payload's `Table` renders, which is why each id leads with its
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
  const { i18n } = useTranslation()
  const { openModal } = useModal()
  const router = useRouter()
  const api = `${config.serverURL}${config.routes.api}`

  const drafts = useMemo(
    () => rows.flatMap(({ eventId, status }) => (status === 'draft' && eventId ? [eventId] : [])),
    [rows],
  )
  const [checked, setChecked] = useState<Set<number>>(() => new Set(drafts))
  const toPublish = drafts.filter((id) => checked.has(id))
  const toDelete = drafts.filter((id) => !checked.has(id))
  const skipped = rows.filter(({ status }) => status === 'duplicate' || status === 'error')

  // One drawer for every link, as Payload's own relationship table does it.
  const [drawerId, setDrawerId] = useState<number>()
  const opening = useRef(false)
  const [DocumentDrawer, , { openDrawer }] = useDocumentDrawer({
    collectionSlug: 'events',
    id: drawerId,
  })
  useEffect(() => {
    if (!opening.current) return
    opening.current = false
    openDrawer()
  }, [drawerId, openDrawer])
  const openEvent = (id: number) => {
    opening.current = true
    if (id === drawerId) openDrawer()
    setDrawerId(id)
  }

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
    for (const error of body.errors ?? []) {
      toast.error(error.message ?? 'A class could not be changed.')
    }
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

  const when = (iso: null | string) =>
    iso ? formatDate({ date: iso, i18n, pattern: config.admin.dateFormat }) : ''

  const eventLink = (id: number, text: string) => (
    <button className="event-import__link" onClick={() => openEvent(id)} type="button">
      {text || 'Untitled'}
    </button>
  )

  const statusSentence = (row: ResultRow): React.ReactNode => {
    switch (row.status) {
      case 'published':
        return `Published ${when(row.at)}`.trim()
      case 'draft':
        return `Created ${when(row.at)}`.trim()
      case 'removed':
        return 'Deleted after the import'
      case 'error':
        return `Error: ${row.error}`
      case 'duplicate':
        return row.original ? (
          <>Duplicate of {eventLink(row.original.id, row.original.title)}</>
        ) : (
          'Duplicate of a class already listed'
        )
    }
  }

  const classes = (count: number) => `${count} draft ${count === 1 ? 'class' : 'classes'}`

  return (
    <div className="field-type event-import__results">
      <div className="event-import__results-header">
        <FieldLabel label={label} path={path} />
        <div className="event-import__results-actions">
          {drafts.length ? (
            <>
              <Button
                buttonStyle="pill"
                disabled={!toPublish.length}
                margin={false}
                onClick={() => openModal(PUBLISH_MODAL)}
                size="small"
              >
                {`Publish (${toPublish.length})`}
              </Button>
              <Button
                buttonStyle="pill"
                disabled={!toDelete.length}
                margin={false}
                onClick={() => openModal(CLEAN_UP_MODAL)}
                size="small"
              >
                {`Clean Up (${toDelete.length})`}
              </Button>
            </>
          ) : null}
          {skipped.length ? (
            <Button
              buttonStyle="pill"
              margin={false}
              onClick={() => void download()}
              size="small"
            >
              {`Download Skipped Rows (${skipped.length})`}
            </Button>
          ) : null}
        </div>
      </div>
      <Table
        appearance="condensed"
        columns={[
          ...(drafts.length
            ? [
                tableColumn(
                  'select',
            <CheckboxInput
              checked={toPublish.length === drafts.length}
              onToggle={toggleAll}
              partialChecked={toPublish.length > 0 && toPublish.length < drafts.length}
            />,
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
              ]
            : []),
          tableColumn(
            'row',
            'Row',
            rows.map(({ row }) => row),
          ),
          tableColumn(
            'title',
            'Title',
            rows.map(({ eventId, title }) => (eventId ? eventLink(eventId, title) : title || '—')),
          ),
          tableColumn(
            'city',
            'City',
            rows.map(({ city }) => city || '—'),
          ),
          tableColumn(
            'status',
            'Status',
            rows.map((row) => <span key={row.row}>{statusSentence(row)}</span>),
          ),
        ]}
        data={rows.map(({ row, status }) => ({ id: `${status}-${row}` }))}
      />
      <FieldDescription description={description} path={path} />
      <DocumentDrawer onDelete={() => router.refresh()} onSave={() => router.refresh()} />
      <ConfirmationModal
        body={`Publish ${classes(toPublish.length)}? They appear in the Atlas straight away.`}
        confirmLabel={`Publish (${toPublish.length})`}
        heading="Publish classes"
        modalSlug={PUBLISH_MODAL}
        onConfirm={() => act('PATCH', toPublish, 'published')}
      />
      <ConfirmationModal
        body={`Delete ${classes(toDelete.length)} that ${
          toDelete.length === 1 ? 'is' : 'are'
        } not ticked? This cannot be undone.`}
        confirmLabel={`Clean Up (${toDelete.length})`}
        heading="Clean up drafts"
        modalSlug={CLEAN_UP_MODAL}
        onConfirm={() => act('DELETE', toDelete, 'deleted')}
      />
    </div>
  )
}
