/**
 * Event verification backfill for the Atlas import. The live verification/expiry
 * state machine (#484) owns the ongoing lifecycle; the importer seeds an initial
 * snapshot from the Atlas status. Pure + unit testable.
 *
 * **`status` is the only authoritative current-state flag in the dump.** Atlas
 * never cleared its lifecycle timestamps on reactivation, so `expired_at`,
 * `archived_at` and `finished_at` are stale on almost every row — 287 of 289
 * `archived_at` and 295 of 297 `expired_at` values are superseded by a later
 * `verified_at`, and all 12 events with a `finished_at` but `status: 0` were
 * re-verified afterwards. Never derive state from a timestamp alone; check it
 * against `verified_at` first (see `isCurrentLifecycleFlag`).
 */
import type { ActorRef, VerificationLogEntry } from '@/lib/eventVerification/log'
import { buildVerificationEntry } from '@/lib/eventVerification/log'
import { addDays, verificationPeriodDays } from '@/lib/eventVerification/periods'

/** The only two stages the Atlas dump's status (0, 6) maps to. */
export type ImportVerificationStage = 'verified' | 'finished'

/**
 * Atlas status int → verificationStage. The dump holds only `0` and `6`;
 * anything else defaults to `verified` (republished, kept on the map).
 */
export function mapStatusToStage(status: number | null | undefined): ImportVerificationStage {
  return status === 6 ? 'finished' : 'verified'
}

/** The Atlas lifecycle timestamps this module reads off a raw dump row. */
export interface AtlasLifecycleTimestamps {
  archived_at?: string | null
  verified_at?: string | null
}

/**
 * Whether an Atlas lifecycle timestamp still reflects the event's current state.
 *
 * Atlas stamped these on transition but never cleared them on reactivation, so a
 * `verified_at` *after* the flag means the event came back to life and the flag is
 * a historical marker, not current state.
 */
export function isCurrentLifecycleFlag(
  flag: string | null | undefined,
  verifiedAt: string | null | undefined,
): boolean {
  if (!flag) return false
  // ISO-8601 UTC strings from the same source — lexicographic order is chronological.
  return !(verifiedAt && verifiedAt > flag)
}

/**
 * `deletedAt` for an imported event: Atlas's `archived_at` when no later
 * verification supersedes it, else `undefined`.
 *
 * Atlas's `archived` terminal is what the Events collection models as a soft
 * delete (`trash: true`), so a genuinely-archived event lands in the admin trash
 * rather than on the map. Only 2 of the 511 dumped events qualify (legacyId 75 and
 * 199); the other 287 carrying an `archived_at` were reactivated.
 */
export function importDeletedAt(
  legacyData: AtlasLifecycleTimestamps | null | undefined,
): string | undefined {
  const archivedAt = legacyData?.archived_at
  return isCurrentLifecycleFlag(archivedAt, legacyData?.verified_at)
    ? (archivedAt as string)
    : undefined
}

export interface ImportVerificationFields {
  verificationStage: ImportVerificationStage
  nextCheckAt?: string
  notificationLog: VerificationLogEntry[]
}

/**
 * Days until an imported event's first verification check.
 *
 * A flat `now + cadence` makes every imported event fall due on the same day: the
 * 511-event dump produced 417 events due inside a single week, which would mean
 * ~417 "verify your event" emails in that week, region escalations the next, and a
 * mass unpublish 21 days later. This spreads them out.
 *
 * Staggers **forward only** — every event keeps at least its full cadence and the
 * jitter is added on top, so nothing is verified *sooner* than it would have been.
 * On the default 90-day cadence that yields a 90–180 day window, ~5 events a day
 * instead of ~60. The cost is a doubled worst-case lease, accepted as a one-off
 * migration artifact: spreading *within* the cadence would instead shorten some
 * leases to days, which is the opposite of the intent (buying time to onboard
 * managers onto the new verification flow).
 *
 * Keyed off `legacyId` rather than random so a re-seed reproduces the same date —
 * `Math.random()` would reshuffle all 417 due dates on every `--update` run.
 */
export function importCheckOffsetDays(
  cadence: string | null | undefined,
  legacyId: number,
): number {
  const cadenceDays = verificationPeriodDays(cadence)
  return cadenceDays + (Math.abs(Math.trunc(legacyId)) % cadenceDays)
}

/**
 * Build the verification field patch for an imported event. Mirrors
 * `computeVerifyFields` for the `verified` case (stage + a staggered `nextCheckAt`
 * derived from the manager's cadence + a single `import` log entry). `finished` is
 * terminal, so it carries the log entry but no active `nextCheckAt`.
 */
export function buildImportVerification(args: {
  status: number | null | undefined
  cadence?: string | null
  legacyId: number
  now: Date
  actor?: ActorRef | null
}): ImportVerificationFields {
  const stage = mapStatusToStage(args.status)
  const entry = buildVerificationEntry('import', args.actor ?? null, args.now.toISOString())
  if (stage === 'finished') {
    return { verificationStage: 'finished', notificationLog: [entry] }
  }
  return {
    verificationStage: 'verified',
    nextCheckAt: addDays(
      args.now,
      importCheckOffsetDays(args.cadence, args.legacyId),
    ).toISOString(),
    notificationLog: [entry],
  }
}
