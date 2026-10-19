import type { JSONFieldServerComponent } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import type { ImportResultRow } from '@/plugins/eventImport/results'

import { type ResultRow, type ResultStatus, ImportResultsTable } from './ImportResultsTable'

const STATUS_WORDS: Record<ResultStatus, [string, string]> = {
  published: ['published', 'published'],
  draft: ['created', 'created'],
  duplicate: ['duplicate', 'duplicates'],
  error: ['error', 'errors'],
  removed: ['deleted', 'deleted'],
}

/** The class a duplicate row repeats, as `refuseDuplicateClass` names it. */
const REPEATS = /\brepeats #(\d+)/

/**
 * The import's result, one line per CSV row, with each created class's live
 * status: it may have been published or cleaned up since the import ran.
 */
export const ImportResultsField: JSONFieldServerComponent = async ({
  clientField,
  data,
  path,
  req,
}) => {
  const results = (data?.results ?? []) as ImportResultRow[]
  const created = results.flatMap(({ eventId }) => (eventId === undefined ? [] : [eventId]))
  const originalOf = (result: ImportResultRow): number | undefined => {
    const match = result.outcome === 'duplicate' ? REPEATS.exec(result.reasons?.join(' ') ?? '') : null
    return match ? Number(match[1]) : undefined
  }
  const originals = results.flatMap((result) => originalOf(result) ?? [])
  const ids = [...new Set([...created, ...originals])]

  const [events, published] = ids.length
    ? await Promise.all([
        req.payload.find({
          collection: 'events',
          where: { id: { in: ids } },
          draft: true,
          depth: 0,
          pagination: false,
          overrideAccess: false,
          user: req.user,
          select: { title: true, _status: true, createdAt: true },
          req,
        }),
        // When each created class was first published: its earliest published version.
        req.payload.findVersions({
          collection: 'events',
          where: {
            and: [{ parent: { in: created } }, { 'version._status': { equals: 'published' } }],
          },
          sort: 'createdAt',
          depth: 0,
          pagination: false,
          overrideAccess: false,
          user: req.user,
          select: { parent: true, createdAt: true },
          req,
        }),
      ])
    : [{ docs: [] }, { docs: [] }]

  const live = new Map(events.docs.map((event) => [event.id, event]))
  const publishedAt = new Map<number, string>()
  for (const version of published.docs) {
    const parent = relationId(version.parent)
    if (parent !== null && !publishedAt.has(parent)) {
      publishedAt.set(parent, version.createdAt)
    }
  }

  const rows: ResultRow[] = results.map((result) => {
    const event = result.eventId === undefined ? undefined : live.get(result.eventId)
    const original = originalOf(result)
    const status: ResultStatus =
      result.outcome !== 'created'
        ? result.outcome
        : event
          ? event._status === 'published'
            ? 'published'
            : 'draft'
          : 'removed'
    return {
      row: result.row,
      status,
      eventId: event ? event.id : undefined,
      title: event?.title || result.title,
      city: result.city,
      at:
        status === 'published'
          ? (publishedAt.get(event!.id) ?? null)
          : status === 'draft'
            ? (event?.createdAt ?? null)
            : null,
      error: status === 'error' ? (result.reasons ?? []).join('; ') : undefined,
      original:
        original === undefined
          ? undefined
          : { id: original, title: live.get(original)?.title ?? `#${original}` },
      reasons: result.reasons,
      values: result.values,
    }
  })

  return (
    <ImportResultsTable
      description={summaryOf(rows)}
      importId={data?.id as number | string}
      label={clientField.label}
      path={path}
      rows={rows}
    />
  )
}

function summaryOf(rows: readonly ResultRow[]): string {
  if (!rows.length) return 'The file held no rows.'
  const counts = new Map<ResultStatus, number>()
  for (const { status } of rows) counts.set(status, (counts.get(status) ?? 0) + 1)
  const parts = (Object.keys(STATUS_WORDS) as ResultStatus[]).flatMap((status) => {
    const count = counts.get(status)
    if (!count) return []
    const [one, many] = STATUS_WORDS[status]
    return [`${count} ${count === 1 ? one : many}`]
  })
  return `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}: ${parts.join(', ')}.`
}

export default ImportResultsField
