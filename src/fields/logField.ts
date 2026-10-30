import type { FieldHook, JSONField, PayloadRequest } from 'payload'

import { z } from 'zod'

import { isAdminManager } from '@/plugins/access/adminOnly'

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

/**
 * The shape every activity log holds. Mirrors {@link LogEntry}.
 *
 * **Every property optional, and no `required` list**, even though
 * `appendLogEntry` has always written all three of `at`, `type` and `cells`.
 * Payload runs this validator on **every save of the document**, including one
 * that never touches the log — so a `required` key makes any row holding an
 * older entry permanently unsaveable, and this column predates the factory: it
 * was Registrations' `reminderLog`, whose entries were reminders with no
 * `cells` at all. Type checks on the properties that *are* present still
 * apply, which is the half worth having; demanding presence is the half that
 * strands a row. (Payload's type generation ignores `required` here anyway, so
 * nothing is lost downstream.)
 *
 * `z.looseObject` is the machine data the doc comment describes: a reminder's
 * stage and recipient, a verification's ten fields. It is genuinely open — each
 * writer owns its own keys — so there is nothing to describe, and the generated
 * `[k: string]: unknown` is the honest type.
 */
const activityLogSchema = z
  .array(
    z.looseObject({
      at: z.string().describe('ISO 8601. The first column, and the sort key.').optional(),
      type: z.string().describe('Stable slug — matched by jobs, never shown.').optional(),
      key: z.string().describe('Exactly-once key, scoped to `type`.').optional(),
      cells: z
        .record(z.string(), logCellSchema)
        .describe('What the columns read. Everything outside this is machine data.')
        .optional(),
    }),
  )
  // `appendLogEntry` trims to `DEFAULT_LOG_LIMIT` on every append, but that is
  // the writers' discipline, not the column's. The bound belongs here too, or a
  // single write that bypasses the helper stores an unbounded array. Generous
  // enough that no legitimate log approaches it.
  .max(500)

/** Which entries of a log record an address, and under which keys. */
export interface LogAddressShape {
  /**
   * The entry `type`s that record one. Every other entry stays whole: a
   * verification's Delivery cell names a method, not a person.
   */
  types: readonly string[]
  /** A machine key (`destination`) or a rendered cell (`cells.delivery`). */
  keys: readonly string[]
}

/**
 * Which address-bearing entries this reader may see whole. Resolved once per
 * read and handed every such entry, so a reader who owns them all costs no
 * query.
 */
export type LogAddressVisibility = (args: {
  req: PayloadRequest
  /** The object the log sits on: the document, or a version's snapshot. */
  doc: Record<string, unknown>
  /** That document's id, when the read carried one. */
  docId: number | null
  entries: LogAddressEntry[]
}) => Promise<(entry: LogAddressEntry) => boolean>

/** An entry that records an address, with the addresses it records. */
export interface LogAddressEntry {
  entry: Record<string, unknown>
  addresses: string[]
}

/**
 * Opt a log in to narrowing the addresses it records, per reader. An entry
 * whose address the reader may not see comes back without its address keys;
 * the rest of it, and every other entry, is untouched.
 */
export interface LogAddressOptions extends LogAddressShape {
  visibility: LogAddressVisibility
}

/** The address an entry holds at `key`: a string, or a cell object's `text`. */
function addressAt(entry: Record<string, unknown>, key: string): string | null {
  const [head, cell] = key.split('.', 2)
  const raw = cell === undefined ? entry[head!] : (entry[head!] as Record<string, unknown>)?.[cell]
  const value = typeof raw === 'object' && raw !== null ? (raw as { text?: unknown }).text : raw
  return typeof value === 'string' && value !== '' ? value : null
}

/** Every address an entry records, or none for an entry of another type. */
export function logEntryAddresses(entry: unknown, shape: LogAddressShape): string[] {
  if (typeof entry !== 'object' || entry === null) return []
  const record = entry as Record<string, unknown>
  if (typeof record.type !== 'string' || !shape.types.includes(record.type)) return []
  return shape.keys
    .map((key) => addressAt(record, key))
    .filter((address): address is string => address !== null)
}

/**
 * The entry with every address key removed — deleted rather than blanked, the
 * same projection a denied field lock makes, so `LogTable` renders an empty
 * cell and the row's JSON drawer shows no address either.
 */
export function withoutLogAddresses(entry: unknown, shape: LogAddressShape): unknown {
  if (logEntryAddresses(entry, shape).length === 0) return entry
  const copy = { ...(entry as Record<string, unknown>) }
  for (const key of shape.keys) {
    const [head, cell] = key.split('.', 2)
    if (cell === undefined) {
      delete copy[head!]
    } else if (typeof copy[head!] === 'object' && copy[head!] !== null) {
      const nested = { ...(copy[head!] as Record<string, unknown>) }
      delete nested[cell]
      copy[head!] = nested
    }
  }
  return copy
}

/** Structural equality over JSON values, ignoring key order (jsonb reorders keys). */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const aKeys = Object.keys(a)
  const bRecord = b as Record<string, unknown>
  return (
    aKeys.length === Object.keys(b).length &&
    aKeys.every(
      (key) =>
        Object.hasOwn(bRecord, key) && sameJson((a as Record<string, unknown>)[key], bRecord[key]),
    )
  )
}

/**
 * Put back the addresses a redacted read removed, on any incoming entry that
 * is exactly a stored entry minus its addresses.
 *
 * ⚠ Without this a redacted read is a deletion waiting for a save. The admin
 * form posts the log it was handed, and `applyReview` appends to the log its
 * own update's afterRead left — both redacted for a reviewer outside the
 * region, and both written back over the stored addresses. Only an exact match
 * restores, so a writer gets back nothing that was not already stored there.
 */
export function restoreLogAddresses(
  incoming: unknown,
  stored: unknown,
  shape: LogAddressShape,
): unknown {
  if (!Array.isArray(incoming) || !Array.isArray(stored)) return incoming
  const redactable = stored.filter((entry) => logEntryAddresses(entry, shape).length > 0)
  if (redactable.length === 0) return incoming
  return incoming.map(
    (entry) =>
      redactable.find(
        (original) =>
          !sameJson(entry, original) && sameJson(entry, withoutLogAddresses(original, shape)),
      ) ?? entry,
  )
}

function redactLogAddresses(options: LogAddressOptions): FieldHook {
  return async ({ data, overrideAccess, req, siblingData, value }) => {
    // ⚠ The same read the field lock exempts, and no other. A job, the
    // update operation's own `originalDoc`, and every internal
    // `overrideAccess: true` read get the whole log — so a read-modify-write
    // never sees a redacted copy. A read that omits the flag is redacted.
    if (overrideAccess === true || !Array.isArray(value)) return value
    const entries = value
      .map((entry) => ({ entry, addresses: logEntryAddresses(entry, options) }))
      .filter((candidate): candidate is LogAddressEntry => candidate.addresses.length > 0)
    if (entries.length === 0) return value

    const doc = (siblingData ?? data ?? {}) as Record<string, unknown>
    const visible = await options.visibility({
      req,
      doc,
      docId: typeof doc.id === 'number' ? doc.id : null,
      entries,
    })
    const hidden = new Set(entries.filter((candidate) => !visible(candidate)).map((c) => c.entry))
    return value.map((entry) => (hidden.has(entry) ? withoutLogAddresses(entry, options) : entry))
  }
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
   * The columns, in order. Omit to derive them from whatever the entries
   * carry — fine for a new log, but declared columns keep the order and
   * headings stable before the data does.
   */
  columns?: LogColumn[]
  admin?: Omit<NonNullable<JSONField['admin']>, 'components' | 'description' | 'readOnly'>
  /**
   * Opt in to narrowing the contact addresses this log records. Without it
   * every reader the lock admits reads every entry whole.
   */
  addresses?: LogAddressOptions
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
  admin = {},
  addresses,
}: LogFieldOptions): JSONField {
  return jsonField({
    name,
    label,
    // Declared here, once, so every consumer of the factory inherits it —
    // `user-submissions.activityLog` included (#695 group B / #659). `jsonField`
    // interns one object per distinct shape, so all three columns still share
    // the single generated `ActivityLog` interface.
    schemaTitle: 'ActivityLog',
    schema: activityLogSchema,
    // ⚠ `admin.readOnly` hides this in the admin UI only. The API needs a
    // real lock: `user-submissions` accepts public creates, so a client
    // could post a forged history the admin table renders as fact.
    //
    // ⚠ Clients, not everyone. The verify action writes the log at
    // `overrideAccess: false` (`Events/lifecycle/verify.ts`), so denying
    // every caller would drop the record of who verified the listing.
    // `read` is locked for a second reason: reminder entries hold manager
    // PII, which restricting `managers` cannot reach inside a JSON column
    // (#821). A denylist, not `managersOnlyFieldAccess`, so all three keys
    // admit the same callers — equivalent, not wider.
    access: {
      // ⚠ With no row in hand, a read is a question about every row: a query
      // validating a `where` or `sort` path (through a join or a relationship
      // hop too), a distinct read, `/api/access`. An address the afterRead
      // narrowing hides is still an oracle there — which rows match
      // `activityLog.destination like …` reads one out a prefix at a time — so
      // a narrowed log answers that only for an admin (#1047). Every read of
      // a row passes it as `doc`, the admin edit view's permissions included.
      read: ({ doc, req }) =>
        req.user?.collection !== 'clients' &&
        (!addresses || doc !== undefined || isAdminManager(req.user)),
      create: ({ req }) => req.user?.collection !== 'clients',
      update: ({ req }) => req.user?.collection !== 'clients',
    },
    // ⚠ The lock admits every manager, and a JSON column cannot be locked key
    // by key — so a log recording someone's address narrows it per entry
    // here, by the reader's relation to the document (#1047).
    ...(addresses && {
      hooks: {
        afterRead: [redactLogAddresses(addresses)],
        beforeChange: [
          ({ previousValue, value }) => restoreLogAddresses(value, previousValue, addresses),
        ],
        // ⚠ `duplicate` reads its source with `overrideAccess: true` and
        // copies every field the body omits, so a copy re-homed into the
        // caller's own region would carry the source's addresses whole. A new
        // document has no history.
        beforeDuplicate: [() => []],
      },
    }),
    admin: {
      ...admin,
      readOnly: true,
      description: `${description} Keeps the most recent ${limit} entries.`,
      components: { Field: '@/components/admin/LogTable' },
      custom: { ...admin.custom, columns },
    },
  })
}
