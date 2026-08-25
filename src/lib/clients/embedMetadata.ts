/**
 * Observed embed metadata for a white-label Atlas client (#633).
 *
 * The widget reports what it *observed* about the page it is installed on
 * rather than someone ticking a box in the admin: the hand-maintained legacy
 * `embed_type` was wrong in the field (`sahajayoga.at` was recorded as `script`
 * and in fact serves an `<iframe>`), so observation is the only trustworthy
 * source.
 *
 * Records are keyed by **origin + pathname**, so a site with several embeds
 * accumulates one record per mount instead of overwriting a single one. A JSON
 * column rather than a collection or indexed columns because nothing queries
 * it — the ownership resolver loads every client with `pagination: false`
 * (~31 rows) and filters in memory.
 *
 * ⚠ Revisit the JSON-column choice if the client count grows by an order of
 * magnitude.
 *
 * Everything here is pure: `POST /api/clients/report`
 * (`./endpoints/report.ts`) is the only writer, and it is a thin transport
 * shell around {@link parseMountKey} and {@link mergeEmbedReport}.
 */
import type { RoutingMode } from './canonical'
import type { JSONSchema4 } from 'json-schema'

import { ROUTING_MODES } from './canonical'

/**
 * How the widget is embedded, as observed at runtime — `iframe` when it is
 * running inside a frame it did not itself create, `script` when it was
 * injected directly into the host document.
 */
// `inline` (not `component`/`script`) and `iframe` — the vocabulary the shipped
// widget sends. See `EmbedMode` in sydevs/SahajAtlasWeb `src/loader/detect.ts`;
// changing either side without the other 400s every report.
export const EMBED_MODES = ['inline', 'iframe'] as const

export type EmbedMode = (typeof EMBED_MODES)[number]

/** What the widget observed about one mount, before it is timestamped. */
export interface EmbedMountObservation {
  /** How the widget is embedded on this page. */
  mode: EmbedMode
  /** Whether the widget is running in the top-level browsing context. */
  topLevel: boolean
  /** Whether the widget can write to the host page's URL (same-origin / History API). */
  urlWritable: boolean
  /** Whether a written URL parameter survived a reload of the host page. */
  paramPersisted: boolean
  /** How the widget encodes its state into that URL. */
  routing: RoutingMode
}

/** One stored mount record — an observation plus when it was last reported. */
export interface EmbedMountRecord extends EmbedMountObservation {
  /** ISO 8601 timestamp of the most recent report for this mount. */
  lastSeen: string
}

/** The stored column: mount records keyed by `origin + pathname`. */
export type EmbedMetadata = Record<string, EmbedMountRecord>

/**
 * Upper bound on stored mounts per client. A forged report can only ever assert
 * viability for a mount someone already designated canonical, but it can still
 * invent keys — this caps what that costs us, evicting least-recently-seen
 * mounts first. Far above any real site's embed count.
 *
 * A bound on *storage*, never on which mounts are knowable: a client at the cap
 * still reports a new mount, so which 50 are held reflects what is currently
 * live rather than what arrived first (#639). The one mount the cap will not
 * spend is the designated canonical — see {@link MergeEmbedReportArgs.pinned}.
 */
export const MAX_EMBED_MOUNTS = 50

/**
 * How long a mount record is considered fresh. A report that repeats an
 * identical observation inside this window is answered without a write — the
 * widget only POSTs on a *change*, so a repeat is either a page reload or
 * abuse, and neither should cost a row update.
 */
export const EMBED_REPORT_REFRESH_MS = 6 * 60 * 60 * 1000

/** Bound on a mount key, so a forged report can't store an unbounded string. */
export const MAX_MOUNT_KEY_LENGTH = 512

/**
 * JSON Schema for the stored column, wired onto the `embedMetadata` field's
 * `jsonSchema`. Payload generates `Client['embedMetadata']` from this **and**
 * compiles it to a write-time validator, so a malformed record throws a
 * `ValidationError` instead of landing in the column.
 *
 * `additionalProperties` on the root is the record schema itself — the keys are
 * mount URLs, which no schema can enumerate. `additionalProperties: false` on
 * each record is the point: a writer that invents a key is rejected.
 */
export const embedMetadataJsonSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'topLevel', 'urlWritable', 'paramPersisted', 'routing', 'lastSeen'],
    properties: {
      mode: { enum: [...EMBED_MODES] },
      topLevel: { type: 'boolean' },
      urlWritable: { type: 'boolean' },
      paramPersisted: { type: 'boolean' },
      routing: { enum: [...ROUTING_MODES] },
      lastSeen: { type: 'string' },
    },
  },
}

/** The one query string a reported mount may carry — a WordPress default permalink. */
const WORDPRESS_PERMALINK_RE = /^\?p=\d+$/

/** Why a reported mount URL was refused. */
export type MountKeyRejection =
  | 'invalid_url'
  | 'unsupported_scheme'
  | 'query_or_fragment'
  | 'credentials'
  | 'too_long'

export type MountKeyResult =
  | { ok: true; key: string; host: string }
  | { ok: false; reason: MountKeyRejection }

/**
 * Validate and normalize a reported mount URL into its storage key.
 *
 * The widget strips the host page's query string and fragment before sending,
 * on the same grounds `hostPageUrl()` already does for Sentry — a host page's
 * query can carry session tokens and personal data we have no business
 * storing. This **re-checks** rather than trusting the client, and rejects
 * rather than silently truncating: a payload that still carries either means
 * the widget is misbehaving, and quietly cleaning it up would hide that.
 *
 * Returns the normalized `origin + pathname` key plus the bare `host`, which
 * the caller checks against the client's `allowedDomains`.
 */
export function parseMountKey(raw: string): MountKeyResult {
  if (raw.length > MAX_MOUNT_KEY_LENGTH) return { ok: false, reason: 'too_long' }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'unsupported_scheme' }
  }
  // A WordPress site on default permalinks has no other way to name its page:
  // every post is `/?p=<id>`, so discarding the query would collapse the whole
  // site onto one mount and leave the canonical page unnameable. `?p=<digits>`
  // is a post id, not seeker input — every other query string is still refused,
  // `?p=123&utm_source=…` included.
  const permalink = WORDPRESS_PERMALINK_RE.test(url.search) ? url.search : ''
  if ((url.search && !permalink) || url.hash) {
    return { ok: false, reason: 'query_or_fragment' }
  }
  if (url.username || url.password) return { ok: false, reason: 'credentials' }

  // `url.origin` drops a default port and lowercases the host; `url.pathname`
  // is percent-normalized. Two spellings of one page therefore share a key.
  return { ok: true, key: `${url.origin}${url.pathname}${permalink}`, host: url.hostname }
}

function isEmbedMountRecord(value: unknown): value is EmbedMountRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    EMBED_MODES.includes(record.mode as EmbedMode) &&
    typeof record.topLevel === 'boolean' &&
    typeof record.urlWritable === 'boolean' &&
    typeof record.paramPersisted === 'boolean' &&
    ROUTING_MODES.includes(record.routing as RoutingMode) &&
    // Parseable, not merely a string: `lastSeen` is the eviction sort key, and
    // an unparseable stamp would make that comparator return NaN — which is not
    // "sorts last", it corrupts the ordering of the whole array. Rejecting it
    // here means the corrupt record is dropped and repaired on the next write,
    // which is what this layer already promises for every other field.
    typeof record.lastSeen === 'string' &&
    !Number.isNaN(Date.parse(record.lastSeen))
  )
}

/**
 * Narrow the stored column to well-formed records, reporting how many were
 * dropped.
 *
 * The field's JSON Schema rejects a malformed *write*, which is exactly why
 * reads have to be defensive: one bad sibling record — a row written before the
 * schema shipped, or a hand-edit — would make every later report fail
 * validation and the endpoint would 500 forever. Dropping it repairs the column
 * on the next write instead.
 */
export function sanitizeEmbedMetadata(stored: unknown): {
  metadata: EmbedMetadata
  dropped: number
} {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return { metadata: {}, dropped: 0 }
  }

  const metadata: EmbedMetadata = {}
  let dropped = 0
  for (const [key, value] of Object.entries(stored)) {
    if (isEmbedMountRecord(value)) {
      metadata[key] = value
    } else {
      dropped++
    }
  }
  return { metadata, dropped }
}

function sameObservation(record: EmbedMountRecord, observation: EmbedMountObservation): boolean {
  return (
    record.mode === observation.mode &&
    record.topLevel === observation.topLevel &&
    record.urlWritable === observation.urlWritable &&
    record.paramPersisted === observation.paramPersisted &&
    record.routing === observation.routing
  )
}

/**
 * True when `lastSeen` is within {@link EMBED_REPORT_REFRESH_MS} of `at`.
 * Compared as an absolute difference so a clock running ahead on either side
 * doesn't turn every report into a write. An unparseable stamp is not fresh.
 */
function isRecentlySeen(lastSeen: string, at: string): boolean {
  const seenMs = Date.parse(lastSeen)
  const atMs = Date.parse(at)
  if (Number.isNaN(seenMs) || Number.isNaN(atMs)) return false
  return Math.abs(atMs - seenMs) <= EMBED_REPORT_REFRESH_MS
}

/**
 * Drop least-recently-seen mounts until at most {@link MAX_EMBED_MOUNTS}
 * remain. Keys in `protectedKeys` are never evicted, whatever their `lastSeen`
 * — see {@link MergeEmbedReportArgs.pinned} for who is in that set and why.
 * Protection removes candidates rather than raising the cap, so a protected
 * mount costs an ordinary one its place.
 *
 * Evicts the whole overflow, not one mount: a record written before the cap
 * existed — or before a mount was pinned — can start out above it.
 *
 * The comparator can't see a NaN: every record here has been through
 * {@link sanitizeEmbedMetadata}, which rejects an unparseable `lastSeen`, and
 * the one record this pass added was stamped from the caller's clock.
 */
function evictOldest(metadata: EmbedMetadata, protectedKeys: Set<string>): string[] {
  const keys = Object.keys(metadata)
  if (keys.length <= MAX_EMBED_MOUNTS) return []

  const evicted = keys
    .filter((key) => !protectedKeys.has(key))
    .sort((a, b) => Date.parse(metadata[a].lastSeen) - Date.parse(metadata[b].lastSeen))
    .slice(0, keys.length - MAX_EMBED_MOUNTS)

  for (const key of evicted) delete metadata[key]
  return evicted
}

export interface MergeEmbedReportArgs {
  /** The column as read back — untrusted, possibly malformed. */
  stored: unknown
  /** Normalized mount key from {@link parseMountKey}. */
  key: string
  observation: EmbedMountObservation
  /** ISO timestamp to stamp as `lastSeen`. */
  at: string
  /**
   * A mount that must survive eviction whatever its `lastSeen` — in practice
   * the client's `canonical.embed`, the one an operator designated.
   *
   * Eviction is keyed on recency, and recency is a proxy for "still live" that
   * a canonical page can fail: it is one page competing with however many the
   * site's traffic touches, and a quiet week of it against fifty churning
   * soft-404s would drop it. Losing it doesn't just cost the record — the
   * picker's selected option and the verification job's subject both resolve
   * through this key, so the live canonical URL would lose the mount it is
   * built from.
   *
   * The mount just reported is protected too, for a different reason: a clock
   * running behind would otherwise make the new record look oldest and delete
   * the very write we came to make.
   */
  pinned?: string | null
}

export interface MergeEmbedReportResult {
  metadata: EmbedMetadata
  /**
   * `false` when the stored record already says exactly this and was seen
   * recently — the caller answers without touching the database.
   */
  changed: boolean
  /** Keys dropped by the {@link MAX_EMBED_MOUNTS} cap. */
  evicted: string[]
}

/**
 * Merge one report into the keyed record set. Merges — never replaces — so two
 * reports from different pages of one site produce two keys.
 */
export function mergeEmbedReport(args: MergeEmbedReportArgs): MergeEmbedReportResult {
  const { stored, key, observation, at, pinned } = args
  const { metadata: current, dropped } = sanitizeEmbedMetadata(stored)
  const existing = current[key]

  // Nothing new to say, and nothing malformed to repair.
  if (
    dropped === 0 &&
    existing !== undefined &&
    sameObservation(existing, observation) &&
    isRecentlySeen(existing.lastSeen, at)
  ) {
    return { metadata: current, changed: false, evicted: [] }
  }

  const metadata: EmbedMetadata = { ...current, [key]: { ...observation, lastSeen: at } }
  const protectedKeys = new Set([key])
  if (pinned) protectedKeys.add(pinned)
  return { metadata, changed: true, evicted: evictOldest(metadata, protectedKeys) }
}
