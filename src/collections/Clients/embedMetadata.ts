import type { JSONSchema4 } from 'json-schema'

import { z } from 'zod'

/**
 * The `embedMetadata` contract — what the Sahaj Atlas widget observes about the
 * page it is mounted on, and how a report merges into the stored record.
 *
 * Pure and transport-agnostic: the JSON Schema types + validates the column
 * (`Clients.embedMetadata`), the Zod schema validates a `POST /api/clients/report`
 * body, and {@link mergeEmbedReport} is the merge rule both the endpoint and its
 * tests run. Nothing here reads a request or touches Payload.
 *
 * **Why observed rather than configured** (#633): `legacyConfig.embed_type` was
 * hand-maintained and is wrong in the field — `sahajayoga.at` is recorded as
 * `script` while actually serving an `<iframe>`. So the widget reports what is
 * true at runtime instead of someone ticking a box.
 */

/** `$id` / `fileMatch` key Payload names the generated type from. */
export const EMBED_METADATA_SCHEMA_URI = 'https://sahajcloud.dev/schemas/client-embed-metadata.json'

/** How the widget is mounted on the host page, as observed at runtime. */
export const EMBED_MODES = ['inline', 'iframe'] as const
export type EmbedMode = (typeof EMBED_MODES)[number]

/**
 * How the widget expresses its view in the URL.
 *
 * **No `hash` option, ever** — the widget is dropping hash routing entirely, so
 * a value that can't be reached is not offered. Shared with `canonical.routing`
 * so the reported and the designated routing can't drift apart.
 */
export const EMBED_ROUTING = ['query', 'path'] as const
export type EmbedRouting = (typeof EMBED_ROUTING)[number]

/** What the widget observed about one mount. `lastSeen` is stamped server-side. */
export interface EmbedMount {
  mode: EmbedMode
  /** False when the widget runs inside an iframe rather than the host document. */
  topLevel: boolean
  /** Whether the widget can write the host URL (same-origin + History API available). */
  urlWritable: boolean
  /** Whether a written parameter survives a reload — a framework router can eat it. */
  paramPersisted: boolean
  routing: EmbedRouting
  /** ISO timestamp of the most recent report for this mount. */
  lastSeen: string
}

/** The stored column: one {@link EmbedMount} per `origin + pathname`. */
export type EmbedMetadata = Record<string, EmbedMount>

/**
 * JSON Schema for the stored column, wired onto the `Clients.embedMetadata`
 * field's `jsonSchema`. Payload generates the TS type from this **and** compiles
 * it to an Ajv validator that runs on write, so a malformed entry throws a
 * `ValidationError` instead of landing in the column — the same guarantee
 * `Events.notificationLog` gets.
 *
 * `additionalProperties` carries the per-mount schema because the keys are the
 * mount URLs themselves and are not knowable ahead of time; the inner
 * `additionalProperties: false` is the point — a writer that invents a field
 * gets rejected rather than silently persisted.
 */
export const embedMetadataJsonSchema: JSONSchema4 = {
  $id: EMBED_METADATA_SCHEMA_URI,
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
      routing: { enum: [...EMBED_ROUTING] },
      lastSeen: { type: 'string' },
    },
  },
}

/**
 * Most distinct mounts one client may accumulate.
 *
 * The cap is the bound that matters on this write path: the column is a JSON
 * blob a published key can append to from any allowed origin, so without a limit
 * a loop over synthetic pathnames grows one row without bound. A site with more
 * than this many distinct embed pages does not exist in the current data (the
 * busiest has three).
 */
export const MAX_EMBED_MOUNTS = 50

/**
 * How stale an unchanged mount must be before a repeat report is written.
 *
 * The widget only POSTs on a *change*, so a stream of identical reports is
 * either a bug or abuse. Suppressing the write collapses that stream into at
 * most one row update per mount per hour, which is the app-level half of this
 * endpoint's rate story — request-rate limiting itself stays at the Cloudflare
 * edge, as it does for every other client request (`.claude/rules/api-clients.md`).
 */
export const EMBED_REPORT_MIN_WRITE_INTERVAL_MS = 60 * 60 * 1000

/**
 * True when `value` is a bare origin — `scheme://host[:port]` with no trailing
 * slash, path, query, or fragment.
 *
 * Delegated to the URL parser rather than a regex: `URL#origin` is *defined* as
 * the serialization we want, so comparing against the input is an exact check
 * (`https://a.org/` fails, because its origin is `https://a.org`).
 */
export function isBareOrigin(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return url.origin === value
}

/**
 * `POST /api/clients/report` body.
 *
 * `origin` + `pathname` arrive as separate fields, already stripped of the host
 * page's query string and fragment — the same reduction `hostPageUrl()` applies
 * before handing a URL to Sentry. The endpoint **rejects** a path that still
 * carries either rather than stripping it server-side: silently accepting one
 * would mean the widget is leaking the seeker's query parameters and nobody
 * would find out.
 */
export const embedReportSchema = z.object({
  origin: z
    .string()
    .max(255)
    .refine(
      isBareOrigin,
      'origin must be a bare scheme://host[:port] with no path, query or fragment',
    ),
  pathname: z
    .string()
    .max(512)
    .refine((v) => v.startsWith('/'), 'pathname must start with "/"')
    .refine(
      (v) => !v.includes('?') && !v.includes('#'),
      'pathname must not carry a query string or fragment — strip them before reporting',
    ),
  mode: z.enum(EMBED_MODES),
  topLevel: z.boolean(),
  urlWritable: z.boolean(),
  paramPersisted: z.boolean(),
  routing: z.enum(EMBED_ROUTING),
})

export type EmbedReport = z.infer<typeof embedReportSchema>

/** The observed half of a report — everything but the mount it describes. */
export type EmbedObservation = Omit<EmbedReport, 'origin' | 'pathname'>

/**
 * Key one mount is stored under.
 *
 * Origin **and** path, so a site running several embeds accumulates a record per
 * mount instead of overwriting one — which is what makes "which of these is the
 * canonical page?" a question someone can answer.
 */
export function mountKey(origin: string, pathname: string): string {
  return `${origin}${pathname}`
}

/**
 * Outcome of merging one report into the stored record.
 *
 * A discriminated union rather than a nullable metadata field: only `merged`
 * has something to write, and `limit-exceeded` carries the limit for the
 * caller's message.
 */
export type EmbedMergeResult =
  | { status: 'merged'; metadata: EmbedMetadata }
  | { status: 'unchanged' }
  | { status: 'limit-exceeded'; limit: number }

/** True when the stored mount already says exactly what this report says. */
function sameObservation(stored: EmbedMount, observed: EmbedObservation): boolean {
  return (
    stored.mode === observed.mode &&
    stored.topLevel === observed.topLevel &&
    stored.urlWritable === observed.urlWritable &&
    stored.paramPersisted === observed.paramPersisted &&
    stored.routing === observed.routing
  )
}

/**
 * Merge one mount's observation into the stored record, **without replacing it**.
 *
 * Three outcomes:
 *
 * - `unchanged` — the stored mount already says this and was seen recently
 *   (within `minWriteIntervalMs`). No write; the endpoint still answers 200,
 *   because from the widget's side nothing is wrong.
 * - `limit-exceeded` — a *new* key would push the record past `maxMounts`.
 *   Known mounts keep reporting normally; only growth is refused.
 * - `merged` — a fresh object with this key set and every other key untouched.
 *
 * An unparseable stored `lastSeen` counts as stale, so a corrupted timestamp
 * self-heals on the next report rather than freezing the mount forever.
 */
export function mergeEmbedReport(args: {
  existing: EmbedMetadata | null | undefined
  key: string
  observation: EmbedObservation
  now: Date
  maxMounts?: number
  minWriteIntervalMs?: number
}): EmbedMergeResult {
  const {
    existing,
    key,
    observation,
    now,
    maxMounts = MAX_EMBED_MOUNTS,
    minWriteIntervalMs = EMBED_REPORT_MIN_WRITE_INTERVAL_MS,
  } = args

  const current: EmbedMetadata = existing ?? {}
  const stored = current[key]

  if (stored) {
    const lastSeen = Date.parse(stored.lastSeen)
    const fresh = Number.isFinite(lastSeen) && now.getTime() - lastSeen < minWriteIntervalMs
    if (fresh && sameObservation(stored, observation)) return { status: 'unchanged' }
  } else if (Object.keys(current).length >= maxMounts) {
    return { status: 'limit-exceeded', limit: maxMounts }
  }

  return {
    status: 'merged',
    metadata: { ...current, [key]: { ...observation, lastSeen: now.toISOString() } },
  }
}
