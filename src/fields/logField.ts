import type { ArrayField, Field, FieldAccess } from 'payload'

import { z } from 'zod'

import { jsonField } from './jsonField'

/**
 * An **activity log**: what happened to a document and when, in a table a
 * manager can read. Emails sent about it, but also anything else worth a
 * record — a registration created, a listing verified, a booking cancelled.
 *
 * Two logs existed before this and agreed on nothing: the Events verification
 * log was rendered by its own component, the Registrations reminder ledger was
 * invisible; one reset per cycle, one grew forever uncapped; each had its own
 * coercion and membership helper.
 *
 * **One row per entry**, not one JSON array per document. An append is then an
 * `INSERT` with bound parameters, which is what `@/lib/atomicWrites/appendLogEntry`
 * writes — a `jsonb` column could be merged only as escaped SQL text, because
 * the connection an append must run on takes no parameters (#1116 review).
 *
 * **Columns are declared here**, on the field, and travel to the renderer in
 * `admin.custom` — the same way `SelectDescription` and `EventQualityPanel` get
 * their config. One table serves a verification cycle and a registrant's mail
 * without either being flattened, because each declares what it shows.
 *
 * Declaring them (rather than deriving them from whatever the entries happen to
 * carry) fixes the order and the headings even when a column is absent from
 * every entry so far — a log that has only ever recorded one kind of event
 * still shows the shape it will grow into. With `columns` omitted the table
 * falls back to deriving them, which keeps a new consumer zero-config.
 *
 * Display is **opt-in, inside `cells`**, and everything else on the entry is
 * machine data. That default is the important one: entries are read back as
 * data — `hasReminderForStage` decides whether to send by reading an entry's
 * stage and recipient — and a verification entry carries ten such fields. With
 * the rule the other way round (every unreserved key is a column) that log
 * rendered a fourteen-column table of raw enum values, which is how this shape
 * was arrived at.
 *
 * **A log is a record, not a query filter.** A job that needs to *find*
 * documents still wants a real dated column beside the log —
 * `followUpSentAt` stays exactly for that. The log says what happened; the
 * column is what the sweep selects on.
 */

/** Entries beyond this are dropped, oldest first, on append. */
export const DEFAULT_LOG_LIMIT = 50

/**
 * One cell. A bare string is the common case; the object form adds a muted
 * `label` inline before the text (`email: a@b.test`) and/or a muted `sub` line
 * beneath it (a recipient's role and region under their name).
 */
export type LogCell = string | { label?: string; text: string; sub?: string }

/** A declared column: which cell it reads, and what to head it. */
export interface LogColumn {
  /** Key within an entry's `cells`. */
  key: string
  /** Heading. Defaults to the key in words (`sentTo` → "Sent To"). */
  label?: string
}

export interface LogEntry {
  /** When it happened (ISO 8601). Always the first column, and the sort key. */
  at: string
  /** Stable slug identifying what kind of entry this is — matched, not shown. */
  type: string
  /** Exactly-once key, scoped to `type`. Its meaning belongs to the writer. */
  key?: string
  /** What a reader sees: one column per key, in the order first seen. */
  cells: Record<string, LogCell>
  /** Anything else a writer needs to read back later. Never rendered. */
  [machine: string]: unknown
}

/**
 * One stored row. An entry's four named parts are columns; everything else it
 * carries is one `data` column, because each writer owns its own keys and a
 * row cannot grow a column per writer.
 */
export interface LogRow {
  at?: string
  type?: string
  key?: string
  cells?: Record<string, LogCell>
  data?: Record<string, unknown>
}

/** The reserved keys — the ones that are columns rather than `data`. */
const RESERVED = ['at', 'type', 'key', 'cells'] as const

/** Split an entry into the row that stores it. */
export function toLogRow(entry: LogEntry): LogRow {
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entry)) {
    if ((RESERVED as readonly string[]).includes(key)) continue
    data[key] = value
  }
  return {
    at: entry.at,
    type: entry.type,
    ...(entry.key === undefined ? {} : { key: entry.key }),
    cells: entry.cells,
    ...(Object.keys(data).length > 0 ? { data } : {}),
  }
}

/**
 * Coerce stored rows into entries, dropping anything malformed.
 *
 * The row's own `data` is spread back out, so a reader sees one flat entry and
 * never has to know which of its keys the schema happened to name. The row id
 * is not part of the entry: it belongs to the table, not to what was recorded.
 */
export function asLog(value: unknown): LogEntry[] {
  if (!Array.isArray(value)) return []
  const entries: LogEntry[] = []
  for (const row of value) {
    if (typeof row !== 'object' || row === null) continue
    const { at, type, key, cells, data } = row as Record<string, unknown>
    if (typeof at !== 'string' || typeof type !== 'string') continue
    if (typeof cells !== 'object' || cells === null) continue
    entries.push({
      ...(typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}),
      at,
      type,
      ...(typeof key === 'string' ? { key } : {}),
      cells: cells as Record<string, LogCell>,
    })
  }
  return entries
}

/**
 * Has this exact thing already been logged? The guard a job checks before
 * sending, so a task retry or an overlapping run never double-sends.
 *
 * Matching on `type` **and** `key` together is deliberate: one log holds
 * several kinds of entry, and a bare key would collide across them.
 */
export function hasLogEntry(log: LogEntry[], type: string, key: string): boolean {
  return log.some((entry) => entry.type === type && entry.key === key)
}

/**
 * Has anything of this kind been logged? The question {@link hasLogEntry}
 * cannot answer, because it matches `type` **and** `key` together.
 *
 * A writer that keys an entry on its own timestamp — so that every occurrence
 * is its own line — leaves no key a later reader could name. `mergeRepeatRegistration`
 * is one, and the manager's registration notice is worded from this.
 *
 * ⚠ **The answer is capped**, because an append drops the oldest entry past
 * {@link DEFAULT_LOG_LIMIT}. Read it where the entry is recent, never as a
 * permanent fact about the row. A column is what outlives the window.
 */
export function hasLogEntryType(log: LogEntry[], type: string): boolean {
  return log.some((entry) => entry.type === type)
}

/**
 * One cell. Mirrors {@link LogCell}.
 */
const logCellSchema = z.union([
  z.string(),
  z.strictObject({
    label: z.string().describe('Muted, inline before the text.').optional(),
    text: z.string(),
    sub: z.string().describe('Muted line beneath the text.').optional(),
  }),
])

export interface LogFieldOptions {
  /** Defaults to `activityLog`; override only when a document needs two logs. */
  name?: string
  label?: ArrayField['label']
  /** Shown under the table — say what this log records and when it's written. */
  description: string
  /** Cap, for the description only; `@/lib/atomicWrites` is what enforces it. */
  limit?: number
  /**
   * The columns, in order. Omit to derive them from whatever the entries
   * carry — fine for a new log, but declared columns keep the order and
   * headings stable before the data does.
   */
  columns?: LogColumn[]
  /** A narrower `read` lock than "anyone but a client", for a log of other people's addresses. */
  read?: FieldAccess
  admin?: Omit<NonNullable<ArrayField['admin']>, 'components' | 'description' | 'readOnly'>
}

/**
 * A read-only activity log field. Never writable through the API — like
 * `systemMetaField`, the writers are jobs and hooks passing `overrideAccess`.
 */
export function logField({
  name = 'activityLog',
  label = 'Activity Log',
  description,
  limit = DEFAULT_LOG_LIMIT,
  columns,
  read,
  admin = {},
}: LogFieldOptions): ArrayField {
  const notClient: FieldAccess = ({ req }) => req.user?.collection !== 'clients'
  return {
    name,
    label,
    type: 'array',
    // ⚠ `admin.readOnly` hides this in the admin UI only. The API needs a
    // real lock: `user-submissions` accepts public creates, so a client
    // could post a forged history the admin table renders as fact.
    //
    // ⚠ Clients, not everyone. The verify action writes the log at
    // `overrideAccess: false` (`Events/lifecycle/verify.ts`), so denying
    // every caller would drop the record of who verified the listing.
    // `read` is locked for a second reason: reminder entries hold manager
    // PII, which restricting `managers` cannot reach inside the row
    // (#821). A denylist, not `managersOnlyFieldAccess`, so all three keys
    // admit the same callers — equivalent, not wider.
    access: {
      read: read ?? notClient,
      create: notClient,
      update: notClient,
    },
    fields: entryFields(),
    admin: {
      ...admin,
      readOnly: true,
      description: `${description} Keeps the most recent ${limit} entries.`,
      components: { Field: '@/components/admin/LogTable' },
      custom: { ...admin.custom, columns },
    },
  }
}

/**
 * The entry's own columns.
 *
 * ⚠ **Every one of them optional.** Payload validates a row on every save of
 * the document, including one that never touches the log, so a `required`
 * column makes a row written under an earlier shape permanently unsaveable —
 * this column predates the factory as Registrations' `reminderLog`, whose
 * entries were reminders with no `cells` at all. {@link asLog} drops a row it
 * cannot read, which is where the shape is actually enforced.
 */
function entryFields(): Field[] {
  return [
    { name: 'at', type: 'text', admin: { description: 'ISO 8601. The sort key.' } },
    { name: 'type', type: 'text', admin: { description: 'Matched by jobs, never shown.' } },
    { name: 'key', type: 'text', admin: { description: 'Exactly-once key, scoped to `type`.' } },
    jsonField({
      name: 'cells',
      schemaTitle: 'ActivityLogCells',
      // Open on the keys, described on the value: a column a writer invents
      // needs no schema change, and every value is still a `LogCell`.
      schema: z.record(z.string(), logCellSchema).nullable(),
    }),
    jsonField({
      name: 'data',
      schemaTitle: 'ActivityLogData',
      // Genuinely open — each writer owns its own keys (a reminder's stage,
      // level, role and recipient; a verification's actor and method), so
      // there is nothing to describe and `[k: string]: unknown` is honest.
      schema: z.looseObject({}).nullable(),
    }),
  ]
}
