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
import { useEffect, useRef, useState } from 'react'

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
  /** The town a row was skipped for having no city region. */
  missingCity?: { name: string }
}

/** The end of the missing-city refusal, which the page turns into a link. */
const CREATE_IT = 'create it first'

/** Why an approximately placed class takes no checkbox. */
const APPROXIMATE = 'Placed at the street, not the building — open the class and check the map pin'

const CONFIRM_MODAL = 'event-import-confirm'

const classes = (count: number) => `${count} draft ${count === 1 ? 'class' : 'classes'}`

/** A first line with quieter lines beneath it. */
const stacked = (lines: readonly React.ReactNode[]) =>
  lines.length > 1 ? (
    <span className="event-import__details">
      {lines.map((line, index) => (
        <span key={index}>{line}</span>
      ))}
    </span>
  ) : (
    lines[0]
  )

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
  /** The skipped rows as a file to fix and upload again, or null for none. */
  skippedCsv: null | string
  targetId: null | number
}> = ({ description, importId, label, path, rows, skippedCsv, targetId }) => {
  const { config } = useConfig()
  const locale = useLocale()
  const { i18n } = useTranslation()
  const { openModal } = useModal()
  const router = useRouter()
  const refresh = () => router.refresh()

  // Every draft the import still holds, which Clean Up reaches when unticked.
  // The tickable ones exclude an approximately placed draft: that is published
  // from its own page, once its pin is checked.
  const allDrafts = rows.filter((row) => row.status === 'draft' && row.eventId)
  const drafts = allDrafts.flatMap((row) => (row.approximate ? [] : [row.eventId!]))
  // Nothing is ticked until the volunteer has looked: Publish starts at zero.
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set())
  const toPublish = drafts.filter((id) => checked.has(id))
  const toDelete = allDrafts.flatMap((row) => (checked.has(row.eventId!) ? [] : [row.eventId!]))
  const skipped = rows.filter((row) => row.status === 'duplicate' || row.status === 'error').length

  const eventDrawer = useDrawerLink('events')
  const managerDrawer = useDrawerLink('managers')
  // A create drawer for the city region a skipped row needed, under the target.
  // The location is left for the volunteer to search: the field shows a bare
  // Mapbox id as its label, and searching the name lands on the same place.
  const [newCity, setNewCity] = useState<Record<string, unknown>>()
  const [RegionDrawer, , { openDrawer: openRegionDrawer }] = useDocumentDrawer({
    collectionSlug: 'regions',
  })

  const [action, setAction] = useState<'clean-up' | 'publish'>('publish')
  const publishing = action === 'publish'
  const confirm = (next: typeof action) => {
    setAction(next)
    openModal(CONFIRM_MODAL)
  }

  const toggle = (id: number) =>
    setChecked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  /** Only drafts this import created, in the admin locale (#701): a stale page touches nothing else. */
  const act = async () => {
    const ids = publishing ? toPublish : toDelete
    const query = `where[and][0][id][in]=${ids.join(',')}&where[and][1][importBatch][equals]=${importId}&where[and][2][_status][equals]=draft`
    const response = await fetch(
      `${config.serverURL}${config.routes.api}/events?${query}&depth=0&locale=${locale.code}`,
      {
        method: publishing ? 'PATCH' : 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...(publishing ? { body: JSON.stringify({ _status: 'published' }) } : {}),
      },
    )
    const body = (await response.json().catch(() => ({}))) as {
      docs?: unknown[]
      errors?: { message?: string }[]
    }
    const done = body.docs?.length ?? 0
    if (done)
      toast.success(
        `${done} ${done === 1 ? 'class' : 'classes'} ${publishing ? 'published' : 'deleted'}.`,
      )
    for (const error of body.errors ?? [])
      toast.error(error.message ?? 'A class could not be changed.')
    if (!response.ok && !body.errors?.length) toast.error('The change could not be made.')
    refresh()
  }

  const download = () => {
    const link = document.createElement('a')
    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(skippedCsv ?? '')}`
    link.download = 'sahaj-atlas-skipped-lines.csv'
    link.click()
  }

  const when = (iso: null | string) =>
    iso ? ` ${formatDate({ date: iso, i18n, pattern: 'MMM d, h:mm a' })}` : ''

  const link = (onClick: () => void, text: string) => (
    <button className="event-import__link" onClick={onClick} type="button">
      {text || 'Untitled'}
    </button>
  )
  const eventLink = (id: number, text: string) => link(() => eventDrawer.open(id), text)

  const statusOf = (row: ResultRow): React.ReactNode => {
    const notes = row.warnings ?? []
    switch (row.status) {
      case 'published':
        return stacked([
          `Published${when(row.at)}`,
          ...(row.unverified ? ['Listed as unverified because the class has no manager'] : []),
          ...(row.approximate ? [APPROXIMATE] : []),
          ...notes,
        ])
      case 'draft':
        return stacked([
          `Created${when(row.at)}`,
          ...(row.approximate ? [`${APPROXIMATE} before publishing`] : []),
          ...notes,
        ])
      case 'removed':
        return 'Deleted after the import'
      case 'error': {
        const error = row.error ?? ''
        const city = row.missingCity
        if (!city || targetId === null || !error.endsWith(CREATE_IT)) return `Error: ${error}`
        return (
          <>
            {`Error: ${error.slice(0, -CREATE_IT.length)}`}
            {link(() => {
              setNewCity({ level: 'city', name: city.name, parent: targetId })
              openRegionDrawer()
            }, CREATE_IT)}
          </>
        )
      }
      case 'duplicate': {
        const { event, row: earlier } = row.duplicateOf ?? {}
        if (event) return <>Duplicate of {eventLink(event.id, event.title)}</>
        if (earlier) return `Duplicate of row ${earlier} in this file`
        return 'Duplicate of a class that has since been deleted'
      }
    }
  }

  const pill = (text: string, onClick: () => void, disabled = false) => (
    <Button buttonStyle="pill" disabled={disabled} margin={false} onClick={onClick} size="small">
      {text}
    </Button>
  )

  return (
    <div className="field-type event-import__results">
      <div className="event-import__results-header">
        <FieldLabel label={label} path={path} />
        <div className="event-import__results-actions">
          {allDrafts.length > 0 && (
            <>
              {pill(`Publish (${toPublish.length})`, () => confirm('publish'), !toPublish.length)}
              {pill(`Clean Up (${toDelete.length})`, () => confirm('clean-up'), !toDelete.length)}
            </>
          )}
          {skipped > 0 && pill(`Download Skipped Rows (${skipped})`, download)}
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
                    onToggle={() =>
                      setChecked(new Set(toPublish.length === drafts.length ? [] : drafts))
                    }
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
            rows.map(({ city, schedule }) => stacked([city || '—', schedule])),
          ),
          tableColumn(
            'manager',
            'Manager',
            rows.map(({ manager }) =>
              manager?.id !== undefined
                ? link(() => managerDrawer.open(manager.id!), manager.name)
                : (manager?.name ?? '—'),
            ),
          ),
          tableColumn('status', 'Status', rows.map(statusOf)),
        ]}
        data={rows.map(({ row, status }) => ({ id: `${status}-${row}` }))}
      />
      <FieldDescription description={description} path={path} />
      <eventDrawer.Drawer onDelete={refresh} onSave={refresh} />
      <managerDrawer.Drawer onSave={refresh} />
      <RegionDrawer
        initialData={newCity}
        onSave={() => {
          toast.success('City created. Upload the skipped rows again to import its classes.')
          refresh()
        }}
      />
      <ConfirmationModal
        body={
          publishing
            ? `Publish ${classes(toPublish.length)}? They appear in the Atlas straight away.`
            : `Delete ${classes(toDelete.length)} that ${toDelete.length === 1 ? 'is' : 'are'} not ticked, including any placed only at the street? This cannot be undone.`
        }
        confirmLabel={
          publishing ? `Publish (${toPublish.length})` : `Clean Up (${toDelete.length})`
        }
        heading={publishing ? 'Publish classes' : 'Clean up drafts'}
        modalSlug={CONFIRM_MODAL}
        onConfirm={act}
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
