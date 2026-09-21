import type { JSONField } from 'payload'

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
    // ⚠ `admin.readOnly` is the admin UI only, and the docblock's promise that
    // this is "never writable through the API" was until now just that — a
    // promise. It did not matter while `activityLog` sat on collections no API
    // client could write; `user-submissions` accepts public creates, so a
    // client could have posted a forged delivery history that the admin table
    // renders as system-written fact.
    //
    // **Clients, not everyone.** `systemMetaField`'s flat `update: () => false`
    // is wrong here: the admin verify action deliberately writes the log with
    // `overrideAccess: false`, so that the manager's own permissions on the
    // event are what gate it (`Events/lifecycle/verify.ts`). Denying every
    // caller silently drops the entry from that write — the entry being the
    // record of who verified the listing. Jobs and hooks pass `overrideAccess`
    // and skip this either way.
    //
    // ⚠ **`read` is here for a different reason, and it is not symmetry.** A
    // reminder entry records the address it went to (`destination`), and an
    // actor falls back to an email when a manager has no name — so this column
    // holds manager PII on `events`, which the `sahaj-atlas` project reads.
    // Restricting the `managers` collection cannot reach a JSON column (#821).
    // Spelled as a denylist rather than `managersOnlyFieldAccess` so all three
    // keys admit the same callers, the verify action's manager write included.
    // Equivalent, not wider: `users` is non-auth, and `hasPermission` refuses a
    // null user before any field check runs.
    access: {
      read: ({ req }) => req.user?.collection !== 'clients',
      create: ({ req }) => req.user?.collection !== 'clients',
      update: ({ req }) => req.user?.collection !== 'clients',
    },
    admin: {
      ...admin,
      readOnly: true,
      description: `${description} Keeps the most recent ${limit} entries.`,
      components: { Field: '@/components/admin/LogTable' },
      custom: { ...admin.custom, columns },
    },
  })
}
