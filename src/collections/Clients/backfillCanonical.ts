/**
 * Seed `canonical.domain` / `canonical.routing` on existing clients from the
 * legacy Atlas config (#633).
 *
 * **A starting point, never a decision.** `canonical.enabled` is left false on
 * every row, because the legacy values are unverified — `sahajayoga.at` is
 * recorded as `embed_type: script` and in fact serves an iframe. Someone has to
 * look at what the widget actually reported (`embedMetadata`) before declaring
 * a client the owner of its region's canonical URLs.
 *
 * The source is `legacyData.config`, the verbatim import record kept by
 * `legacyMigrationFields()` — not the `legacyConfig` column, which this
 * ticket's migration drops. Same values (the importer copied one from the
 * other), and reading the surviving one means the script works whether it runs
 * before or after the deploy that applies the migration. That matters here:
 * migrations auto-apply in-process on Railway boot, so a script that needed the
 * dropped column could never be run in time.
 *
 * Re-runnable: a second pass reports every row unchanged, because it only ever
 * fills a field that is currently empty.
 *
 * Driven by `scripts/backfill-client-canonical.ts`.
 */
import type { Client } from '@/payload-types'
import type { Payload } from 'payload'

import type { RoutingMode } from './canonical'

import { normalizeCanonicalDomain, ROUTING_MODES } from './canonical'

export interface CanonicalBackfillChange {
  id: number
  name: string
  /** Domain to seed, or `null` when the legacy record had none usable. */
  domain: string | null
  /** Routing to seed, or `null` when the legacy record had none usable. */
  routing: RoutingMode | null
  /** Set when the write failed; the row is counted as `failed`. */
  error?: string
}

export interface CanonicalBackfillStats {
  scanned: number
  /** Rows written (or that would be written, on a dry run). */
  changed: number
  /** Rows that already had a domain and a routing, or already opted in. */
  unchanged: number
  /** Rows whose legacy record held nothing usable to seed from. */
  skipped: number
  failed: number
}

/** The subset of the legacy Atlas client record this reads. */
interface LegacyClientConfig {
  domain?: unknown
  routing_type?: unknown
}

function legacyConfigOf(legacyData: Client['legacyData']): LegacyClientConfig | null {
  if (typeof legacyData !== 'object' || legacyData === null || Array.isArray(legacyData)) {
    return null
  }
  const config = (legacyData as { config?: unknown }).config
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return null
  return config as LegacyClientConfig
}

function legacyRoutingOf(config: LegacyClientConfig): RoutingMode | null {
  const routing = config.routing_type
  return ROUTING_MODES.includes(routing as RoutingMode) ? (routing as RoutingMode) : null
}

export async function backfillClientCanonical(args: {
  payload: Payload
  /** Write when true; otherwise report what would change. */
  apply: boolean
  onChange?: (change: CanonicalBackfillChange) => void
}): Promise<CanonicalBackfillStats> {
  const { payload, apply, onChange } = args

  const { docs } = await payload.find({
    collection: 'clients',
    pagination: false,
    depth: 0,
    select: { name: true, canonical: true, legacyData: true, _status: true },
    overrideAccess: true,
  })

  const stats: CanonicalBackfillStats = {
    scanned: docs.length,
    changed: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  }

  for (const doc of docs) {
    // A client someone already opted in is configured, not a candidate for
    // seeding — leave it entirely alone.
    if (doc.canonical?.enabled) {
      stats.unchanged++
      continue
    }

    const config = legacyConfigOf(doc.legacyData)
    const legacyDomain = config ? normalizeCanonicalDomain(config.domain as string) : null
    const legacyRouting = config ? legacyRoutingOf(config) : null

    // `domain` is only ever filled when empty — it is typed by hand, so a
    // stored value is someone's decision and outranks the legacy one.
    const domain = doc.canonical?.domain ? null : legacyDomain

    // `routing` is different, and the difference is in the migration: the
    // column ships `DEFAULT 'query'`, which Postgres backfills onto every
    // existing row. So a stored `routing` is not evidence anyone chose it, and
    // gating on emptiness here would silently skip the one legacy client on
    // `path`. Seeding it is safe because this loop already skipped every client
    // that opted in — nobody has committed to this configuration yet.
    const routing = legacyRouting && legacyRouting !== doc.canonical?.routing ? legacyRouting : null

    if (domain === null && routing === null) {
      // Nothing to seed: either the row already says this, or the legacy record
      // held nothing usable.
      if (doc.canonical?.domain || legacyRouting) stats.unchanged++
      else stats.skipped++
      continue
    }

    const change: CanonicalBackfillChange = { id: doc.id, name: doc.name, domain, routing }

    if (apply) {
      try {
        await payload.update({
          collection: 'clients',
          id: doc.id,
          data: {
            canonical: {
              // Never promoted here — the legacy values are unverified, so a
              // human decides ownership after reading `embedMetadata`.
              enabled: false,
              ...(domain ? { domain } : {}),
              ...(routing ? { routing } : {}),
            },
          },
          // `draft` is deliberately not set: a plain update leaves `_status`
          // untouched (Payload only rewrites it when saving a draft), so a
          // disabled Atlas service stays a draft and still cannot authenticate
          // — while the seeded values land in the main table, which is what the
          // ownership resolver reads.
          overrideAccess: true,
        })
        stats.changed++
      } catch (error) {
        change.error = error instanceof Error ? error.message : String(error)
        stats.failed++
      }
    } else {
      stats.changed++
    }

    onChange?.(change)
  }

  return stats
}
