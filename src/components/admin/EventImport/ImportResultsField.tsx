import type { JSONFieldServerComponent } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import type { Manager } from '@/payload-types'
import type { ImportResultRow } from '@/plugins/eventImport/results'

import { type ResultRow, type ResultStatus, ImportResultsTable } from './ImportResultsTable'
import { csvScheduleSummary, liveScheduleSummary } from './scheduleSummary'

const STATUS_WORDS: Record<ResultStatus, [string, string]> = {
  published: ['published', 'published'],
  draft: ['created', 'created'],
  duplicate: ['duplicate', 'duplicates'],
  error: ['error', 'errors'],
  removed: ['deleted', 'deleted'],
}

/**
 * The import's result, one line per CSV row, with each created class's live
 * status: it may have been published or cleaned up since the import ran.
 *
 * ⚠ **Read past access, on purpose.** Only the uploader and admins can open an
 * import, and these are the classes it created — so "not found" here means
 * deleted, never "you may not see it". Whether a link then opens is the
 * drawer's own access check.
 */
export const ImportResultsField: JSONFieldServerComponent = async ({
  clientField,
  data,
  path,
  req,
}) => {
  const results = (data?.results ?? []) as ImportResultRow[]
  const created = results.flatMap(({ eventId }) => (eventId === undefined ? [] : [eventId]))
  const originalOf = (result: ImportResultRow): number | undefined => result.duplicateOf?.eventId
  const originals = results.flatMap((result) => originalOf(result) ?? [])
  const ids = [...new Set([...created, ...originals])]

  const [events, published] = ids.length
    ? await Promise.all([
        req.payload.find({
          collection: 'events',
          where: { id: { in: ids } },
          // The stored document, not its newest draft: a published class with
          // an edit saved as a draft is still published.
          draft: false,
          depth: 1,
          pagination: false,
          overrideAccess: true,
          select: {
            title: true,
            eventType: true,
            address: true,
            _status: true,
            createdAt: true,
            manager: true,
            verificationStage: true,
            inactive: true,
            schedule: true,
          },
          populate: { managers: { name: true, email: true } },
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
          overrideAccess: true,
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
      schedule: event
        ? liveScheduleSummary(event.schedule, event.inactive)
        : csvScheduleSummary(result.values),
      manager: managerOf(event, result),
      unverified: status === 'published' && event?.verificationStage === 'unverified',
      // Placed at the street or town rather than the building: the import
      // stores no address id then, and choosing an address in the class's
      // Location tab sets one.
      approximate: event?.eventType === 'offline' && !event.address?.mapboxId,
      warnings: result.warnings,
      at:
        status === 'published'
          ? (publishedAt.get(event!.id) ?? null)
          : status === 'draft'
            ? (event?.createdAt ?? null)
            : null,
      error: status === 'error' ? (result.reasons ?? []).join('; ') : undefined,
      duplicateOf: result.duplicateOf
        ? {
            row: result.duplicateOf.row,
            // A deleted original keeps no link; the drawer would open empty.
            event:
              original !== undefined && live.has(original)
                ? { id: original, title: live.get(original)?.title || result.duplicateOf.title || '' }
                : undefined,
          }
        : undefined,
      reasons: result.reasons,
      values: result.values,
      missingCity: result.missingCity,
    }
  })

  return (
    <ImportResultsTable
      description={summaryOf(rows)}
      importId={data?.id as number | string}
      targetId={relationId(data?.targetRegion)}
      label={clientField.label}
      path={path}
      rows={rows}
    />
  )
}

/**
 * Who looks after the class: its live manager, linkable by id, or — for a row
 * that created nothing — the one the CSV named, which may have no record.
 */
function managerOf(
  event: { manager?: number | Manager | null } | undefined,
  result: ImportResultRow,
): ResultRow['manager'] {
  if (event) {
    const manager = event.manager
    return manager && typeof manager === 'object'
      ? { id: manager.id, name: manager.name || manager.email || `#${manager.id}` }
      : null
  }
  const named = result.values?.managerName || result.values?.managerEmail
  return named ? { name: named } : null
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
