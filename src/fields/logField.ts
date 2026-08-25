import type { JSONField } from 'payload'

/**
 * A **delivery log**: the record of messages a system sent about one document,
 * so a manager can answer "did that actually go out, and to whom?" without
 * reading application logs or the database.
 *
 * That question is the whole point, and it's why this is a field factory rather
 * than a convention. Two logs already existed — the Events verification
 * `notificationLog` and the Registrations reminder ledger — written months
 * apart, and they agreed on nothing: one was rendered, one was invisible; one
 * reset per cycle, one grew forever with no cap; each had its own coercion and
 * membership helper. A third was about to be added for post-event follow-ups.
 *
 * What every log genuinely shares, and therefore what lives here:
 *
 * - the field config (json, read-only, a renderer, a description);
 * - the entry shape a reader needs — **when**, **what**, **to whom**;
 * - coercion from a loosely-typed JSON column into typed entries;
 * - append-with-a-cap, so a log on a long-lived document can't grow unbounded;
 * - the exactly-once membership check jobs use before sending.
 *
 * What deliberately does *not* live here: the dedup key's meaning, and any
 * domain detail a particular log wants to show. Entries carry an opaque `key`
 * for the former and tolerate extra properties for the latter, so a consumer
 * with a richer story to tell (the verification log's escalation level and
 * recipient tier) keeps its own renderer without being flattened into this one.
 *
 * **A log is a record, not a query filter.** Nothing can `where` on a JSON
 * column cheaply, so a job that needs to *find* documents still wants a real
 * dated column beside the log — `followUpSentAt` stays exactly for that. The
 * log says what happened; the column is what the sweep selects on.
 */

/** Entries beyond this are dropped, oldest first, on append. */
export const DEFAULT_LOG_LIMIT = 50

/**
 * One line in a delivery log. Extra properties are allowed — a consumer with a
 * custom renderer may carry its own fields — but these are what any reader,
 * and the shared table, can rely on.
 */
export interface LogEntry {
  /** When it happened (ISO 8601). Sorted and displayed by this. */
  at: string
  /** What happened, as a stable slug: `reminder`, `follow-up`, `verification`. */
  event: string
  /** One-line human summary — this is what the manager actually reads. */
  summary: string
  /** Delivery channel, when the entry records a message (`email`, `whatsapp`). */
  channel?: string
  /** Address or handle it went to. */
  destination?: string
  /**
   * Opaque exactly-once key, scoped to `event` — the occurrence a reminder
   * covered, the stage a notice was sent for. Never rendered; its meaning
   * belongs to the job that writes it.
   */
  key?: string
  [extra: string]: unknown
}

/** Coerce a loosely-typed JSON column into entries, dropping anything malformed. */
export function asLog(value: unknown): LogEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is LogEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as LogEntry).at === 'string' &&
      typeof (entry as LogEntry).event === 'string',
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
 * Matching on `event` **and** `key` together is deliberate: one log now holds
 * several kinds of message, and a bare key could collide across them.
 */
export function hasLogEntry(log: LogEntry[], event: string, key: string): boolean {
  return log.some((entry) => entry.event === event && entry.key === key)
}

export interface LogFieldOptions {
  name: string
  label?: JSONField['label']
  /** Shown under the table — say what this log records and when it's written. */
  description: string
  /** Cap, for the description only; `appendLogEntry` is what enforces it. */
  limit?: number
  /**
   * Renderer override. Defaults to the shared table, which reads `at` /
   * `summary` / `channel` / `destination`. Override only when the log carries
   * domain detail worth its own columns.
   */
  component?: string
  admin?: Omit<NonNullable<JSONField['admin']>, 'components' | 'description' | 'readOnly'>
}

const SHARED_LOG_TABLE = '@/components/admin/LogTable'

/**
 * A read-only delivery log field. Never writable through the API — like
 * `systemMetaField`, the writers are jobs and hooks passing `overrideAccess`.
 */
export function logField({
  name,
  label,
  description,
  limit = DEFAULT_LOG_LIMIT,
  component = SHARED_LOG_TABLE,
  admin = {},
}: LogFieldOptions): JSONField {
  return {
    name,
    type: 'json',
    ...(label !== undefined ? { label } : {}),
    admin: {
      ...admin,
      readOnly: true,
      description: `${description} Keeps the most recent ${limit} entries.`,
      components: { Field: component },
    },
  }
}
