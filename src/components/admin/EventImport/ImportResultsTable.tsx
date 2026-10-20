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
  useLocale,
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
  /** The schedule in a few words (`scheduleSummary.ts`). */
  schedule: string
  /** Who looks after the class (`id` when there is a record to open), or null for nobody. */
  manager: null | { id?: number; name: string }
  /** Published with no manager, so the Atlas lists it as unverified. */
  unverified?: boolean
  /** Placed at the street or town, not the building: published one at a time, after a look. */
  approximate?: boolean
  /** Things the import noticed that did not stop the row. */
  warnings?: string[]
  /** When the class was created (a draft) or first published, as ISO. */
  at: null | string
  /** Why a row failed, for `error`. */
  error?: string
  /** What a `duplicate` row repeats: an earlier row, or a class (absent once deleted). */
  duplicateOf?: { row?: number; event?: { id: number; title: string } }
  reasons?: string[]
  values?: Record<string, string>
  /** The town a row was skipped for having no city region. */
  missingCity?: { name: string }
}

/** Short enough for a table cell: "Oct 19, 1:37 PM". */
const SHORT_DATE = 'MMM d, h:mm a'

/** The end of the missing-city refusal, which the page turns into a link. */
const CREATE_IT = 'create it first'

/** Why an approximately placed class takes no checkbox. */
const APPROXIMATE = 'Placed at the street, not the building — open the class and check the map pin'

/** A status sentence with quieter lines beneath it. */
const withNotes = (head: string, notes: readonly string[]): React.ReactNode =>
  notes.length ? (
    <span className="event-import__details">
      <span>{head}</span>
      {notes.map((note) => (
        <span key={note}>{note}</span>
      ))}
    </span>
  ) : (
    head
  )

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
  targetId: null | number
}> = ({ description, importId, label, path, rows, targetId }) => {
  const { config } = useConfig()
  const locale = useLocale()
  const { i18n } = useTranslation()
  const { openModal } = useModal()
  const router = useRouter()
  const api = `${config.serverURL}${config.routes.api}`

  // Every draft this import still holds, which Clean Up reaches when unticked.
  const allDrafts = useMemo(
    () => rows.flatMap(({ eventId, status }) => (status === 'draft' && eventId ? [eventId] : [])),
    [rows],
  )
  // The tickable ones: an approximately placed draft is published from its
  // own page, once its pin is checked, so it takes no checkbox.
  const drafts = useMemo(
    () =>
      rows.flatMap(({ approximate, eventId, status }) =>
        status === 'draft' && eventId && !approximate ? [eventId] : [],
      ),
    [rows],
  )
  // Nothing is ticked until the volunteer has looked: Publish starts at zero.
  const [checked, setChecked] = useState<Set<number>>(() => new Set())
  const toPublish = drafts.filter((id) => checked.has(id))
  const toDelete = allDrafts.filter((id) => !checked.has(id))
  const skipped = rows.filter(({ status }) => status === 'duplicate' || status === 'error')

  const eventDrawer = useDrawerLink('events')
  const managerDrawer = useDrawerLink('managers')

  // A create drawer for the city region a skipped row needed, under the target.
  const [newCity, setNewCity] = useState<Record<string, unknown>>()
  const [RegionDrawer, , { openDrawer: openRegionDrawer }] = useDocumentDrawer({
    collectionSlug: 'regions',
  })
  const creatingCity = useRef(false)
  useEffect(() => {
    if (!creatingCity.current) return
    creatingCity.current = false
    openRegionDrawer()
  }, [newCity, openRegionDrawer])
  // The location is left for the volunteer to search: the field shows a bare
  // Mapbox id as its label, and searching the name lands on the same place.
  const createCity = (city: { name: string }) => {
    creatingCity.current = true
    setNewCity({ level: 'city', name: city.name, parent: targetId })
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
    // The admin locale, because the role gates are per locale (#701).
    const response = await fetch(`${api}/events?${where(ids)}&depth=0&locale=${locale.code}`, {
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
    iso ? formatDate({ date: iso, i18n, pattern: SHORT_DATE }) : ''

  const link = (open: (id: number) => void, id: number, text: string) => (
    <button className="event-import__link" onClick={() => open(id)} type="button">
      {text || 'Untitled'}
    </button>
  )
  const eventLink = (id: number, text: string) => link(eventDrawer.open, id, text)

  const statusSentence = (row: ResultRow): React.ReactNode => {
    switch (row.status) {
      case 'published':
        return withNotes(`Published ${when(row.at)}`.trim(), [
          ...(row.unverified ? ['Listed as unverified because the class has no manager'] : []),
          ...(row.approximate ? [APPROXIMATE] : []),
          ...(row.warnings ?? []),
        ])
      case 'draft':
        return withNotes(`Created ${when(row.at)}`.trim(), [
          ...(row.approximate ? [`${APPROXIMATE} before publishing`] : []),
          ...(row.warnings ?? []),
        ])
      case 'removed':
        return 'Deleted after the import'
      case 'error': {
        const error = row.error ?? ''
        if (row.missingCity && targetId !== null && error.endsWith(CREATE_IT)) {
          const city = row.missingCity
          return (
            <>
              {`Error: ${error.slice(0, -CREATE_IT.length)}`}
              <button className="event-import__link" onClick={() => createCity(city)} type="button">
                {CREATE_IT}
              </button>
            </>
          )
        }
        return `Error: ${error}`
      }
      case 'duplicate':
        if (row.duplicateOf?.event) {
          return <>Duplicate of {eventLink(row.duplicateOf.event.id, row.duplicateOf.event.title)}</>
        }
        if (row.duplicateOf?.row) return `Duplicate of row ${row.duplicateOf.row} in this file`
        return 'Duplicate of a class that has since been deleted'
    }
  }

  const classes = (count: number) => `${count} draft ${count === 1 ? 'class' : 'classes'}`

  return (
    <div className="field-type event-import__results">
      <div className="event-import__results-header">
        <FieldLabel label={label} path={path} />
        <div className="event-import__results-actions">
          {allDrafts.length ? (
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
            rows.map(({ approximate, eventId, status }) =>
              status === 'draft' && eventId && !approximate ? (
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
            'details',
            'Details',
            rows.map(({ city, row, schedule }) => (
              <span className="event-import__details" key={row}>
                <span>{city || '—'}</span>
                <span>{schedule}</span>
              </span>
            )),
          ),
          tableColumn(
            'manager',
            'Manager',
            rows.map(({ manager }) =>
              !manager
                ? '—'
                : manager.id !== undefined
                  ? link(managerDrawer.open, manager.id, manager.name)
                  : manager.name,
            ),
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
      <eventDrawer.Drawer onDelete={() => router.refresh()} onSave={() => router.refresh()} />
      <managerDrawer.Drawer onSave={() => router.refresh()} />
      <RegionDrawer
        initialData={newCity}
        onSave={() => {
          toast.success('City created. Upload the skipped rows again to import its classes.')
          router.refresh()
        }}
      />
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
        } not ticked, including any placed only at the street? This cannot be undone.`}
        confirmLabel={`Clean Up (${toDelete.length})`}
        heading="Clean up drafts"
        modalSlug={CLEAN_UP_MODAL}
        onConfirm={() => act('DELETE', toDelete, 'deleted')}
      />
    </div>
  )
}

/**
 * One document drawer serving every link to a collection, opened on the id
 * clicked — the way Payload's own relationship table does it. The id is set
 * first and the drawer opened once the hook has it.
 */
function useDrawerLink(collectionSlug: string) {
  const [id, setId] = useState<number>()
  const opening = useRef(false)
  const [Drawer, , { openDrawer }] = useDocumentDrawer({ collectionSlug, id })
  useEffect(() => {
    if (!opening.current) return
    opening.current = false
    openDrawer()
  }, [id, openDrawer])
  const open = (next: number) => {
    opening.current = true
    if (next === id) openDrawer()
    setId(next)
  }
  return { Drawer, open }
}
