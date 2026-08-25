import type { JSONField } from 'payload'

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
 * **The entry decides the columns**, through its `cells`. Each key in there
 * becomes a column headed by its name in words, so a consumer adds a column by
 * writing one and no component changes — which is what lets one table serve a
 * verification cycle and a registrant's mail without either being flattened.
 *
 * Display is **opt-in, inside `cells`**, and everything else on the entry is
 * machine data. That default is the important one: entries are read back as
 * data — `hasReminderForStage` decides whether to send by reading an entry's
 * stage and recipient — and a verification entry carries ten such fields. With
 * the rule the other way round (every unreserved key is a column) that log
 * rendered a fourteen-column table of raw enum values, which is how this shape
 * was arrived at.
 *
 * **A log is a record, not a query filter.** Nothing can `where` on a JSON
 * column cheaply, so a job that needs to *find* documents still wants a real
 * dated column beside the log — `followUpSentAt` stays exactly for that. The
 * log says what happened; the column is what the sweep selects on.
 */

/** Entries beyond this are dropped, oldest first, on append. */
export const DEFAULT_LOG_LIMIT = 50

/**
 * One cell. A bare string is the common case; the object form adds a muted
 * `label` inline before the text (`email: a@b.test`) and/or a muted `sub` line
 * beneath it (a recipient's role and region under their name).
 */
export type LogCell = string | { label?: string; text: string; sub?: string }

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

/** Coerce a loosely-typed JSON column into entries, dropping anything malformed. */
export function asLog(value: unknown): LogEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is LogEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as LogEntry).at === 'string' &&
      typeof (entry as LogEntry).type === 'string' &&
      typeof (entry as LogEntry).cells === 'object' &&
      (entry as LogEntry).cells !== null,
  )
}

/**
 * Append an entry, dropping the oldest once `limit` is reached.
 *
 * Trimming is why this exists rather than `[...log, entry]` at each call site.
 * A reminder log on a weekly class gains an entry per occurrence — 52 a year,
 * read and rewritten on every send — and nothing was bounding it.
 */
export function appendLogEntry(
  log: LogEntry[],
  entry: LogEntry,
  limit: number = DEFAULT_LOG_LIMIT,
): LogEntry[] {
  const appended = [...log, entry]
  return appended.length > limit ? appended.slice(appended.length - limit) : appended
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

export interface LogFieldOptions {
  /** Defaults to `activityLog`; override only when a document needs two logs. */
  name?: string
  label?: JSONField['label']
  /** Shown under the table — say what this log records and when it's written. */
  description: string
  /** Cap, for the description only; `appendLogEntry` is what enforces it. */
  limit?: number
  /**
   * Column headings, keyed by entry key. Anything unlisted is headed by its
   * key in words (`sentTo` → "Sent To"), which is usually right.
   */
  columnLabels?: Record<string, string>
  admin?: Omit<NonNullable<JSONField['admin']>, 'components' | 'description' | 'readOnly'>
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
  columnLabels,
  admin = {},
}: LogFieldOptions): JSONField {
  return {
    name,
    type: 'json',
    label,
    admin: {
      ...admin,
      readOnly: true,
      description: `${description} Keeps the most recent ${limit} entries.`,
      components: { Field: '@/components/admin/LogTable' },
      custom: { ...admin.custom, columnLabels },
    },
  }
}
