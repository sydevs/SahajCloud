/**
 * Seed #484's event verification backfill for the Atlas import. The deferred
 * verification/expiry state machine (#484) owns the live lifecycle; the importer
 * only seeds an initial snapshot from the Atlas status. Pure + unit testable.
 */
import type { ActorRef, VerificationLogEntry } from '@/lib/eventVerification/log'
import { buildVerificationEntry } from '@/lib/eventVerification/log'
import { addDays, verificationPeriodDays } from '@/lib/eventVerification/periods'

/** The only two stages the Atlas dump's status (0, 6) maps to. */
export type ImportVerificationStage = 'verified' | 'finished'

/**
 * Atlas status int → #484 verificationStage. The dump holds only `0` and `6`;
 * anything else defaults to `verified` (republished, kept on the map).
 */
export function mapStatusToStage(status: number | null | undefined): ImportVerificationStage {
  return status === 6 ? 'finished' : 'verified'
}

export interface ImportVerificationFields {
  verificationStage: ImportVerificationStage
  nextCheckAt?: string
  notificationLog: VerificationLogEntry[]
}

/**
 * Build the verification field patch for an imported event. Mirrors
 * `computeVerifyFields` for the `verified` case (stage + a `nextCheckAt` from
 * the manager's cadence + a single `import` log entry). `finished` is terminal,
 * so it carries the log entry but no active `nextCheckAt`.
 */
export function buildImportVerification(args: {
  status: number | null | undefined
  cadence?: string | null
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
    nextCheckAt: addDays(args.now, verificationPeriodDays(args.cadence)).toISOString(),
    notificationLog: [entry],
  }
}
