import type { JSONFieldServerComponent } from 'payload'

import type { ImportResultRow } from '@/plugins/eventImport/results'

import { type ResultRow, type ResultStatus, ImportResultsTable } from './ImportResultsTable'

const STATUS_WORDS: Record<ResultStatus, [string, string]> = {
  published: ['published', 'published'],
  draft: ['created', 'created'],
  duplicate: ['duplicate', 'duplicates'],
  error: ['error', 'errors'],
  removed: ['removed', 'removed'],
}

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
  const ids = results.flatMap(({ eventId }) => (eventId === undefined ? [] : [eventId]))

  const { docs } = ids.length
    ? await req.payload.find({
        collection: 'events',
        where: { id: { in: ids } },
        draft: true,
        depth: 0,
        pagination: false,
        overrideAccess: false,
        user: req.user,
        select: { title: true, _status: true },
        req,
      })
    : { docs: [] }
  const live = new Map(docs.map((event) => [event.id, event]))

  const rows: ResultRow[] = results.map((result) => {
    const event = result.eventId === undefined ? undefined : live.get(result.eventId)
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
      notes: result.reasons?.join('; ') ?? '',
      values: result.values,
      reasons: result.reasons,
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
