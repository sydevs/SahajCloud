/** What one import run knows about itself, from the job's start to its finish. */

import type { ImportTarget } from './regions'
import type { PayloadRequest, RequestContext } from 'payload'

import { EVENT_MACHINE } from '@/lib/eventVerification/machine'
import { withActor } from '@/lib/stateMachine/actor'

/**
 * Set on every class the job creates, so `refreshFromEvent` (`index.ts`)
 * leaves the import alone until the run itself writes the outcome.
 */
export const RUN_CONTEXT_KEY = 'eventImport'

/**
 * What every class the job writes carries: the marker above, and the writer the
 * stage guard reads.
 *
 * ⚠ **One definition, because the dry validation pass has to match the create.**
 * `fieldErrors` runs Payload's own field `beforeChange` pass over a built class
 * (`validate.ts`), and the stage guard is one of those hooks — so a pass given
 * a different context refuses a class the create would have written.
 */
export const importWriteContext = (): RequestContext =>
  withActor({ [RUN_CONTEXT_KEY]: true }, EVENT_MACHINE, 'import')

/** A town the import found no city region for, as Mapbox names it. */
export interface MissingCity {
  name: string
}

/** What a skipped row repeats: a class already listed, or an earlier row of the same file. */
export interface DuplicateOf {
  eventId?: number
  title?: string
  row?: number
}

/** A row of the file: its spreadsheet line, and its values. */
export interface ImportRow {
  row: number
  values: Record<string, string>
}

export interface SkippedRow extends ImportRow {
  reasons: string[]
  missingCity?: MissingCity
  duplicateOf?: DuplicateOf
}

export interface CreatedRow extends ImportRow {
  eventId: number
}

export interface ImportRun {
  importId: number
  target: ImportTarget
  /** The uploader, with their per-locale roles: every class is created as them. */
  uploader: NonNullable<PayloadRequest['user']>
  /** The admin locale at the upload, which the classes are written in. */
  locale?: string
  defaultLanguages: string[]
  created: CreatedRow[]
  skipped: SkippedRow[]
  /** City regions under the target, by the Mapbox place id each holds. */
  cities: Map<string, number>
  /** Each class key a row of this file has claimed, and that row, so a later twin is caught. */
  claimed: Map<string, number>
}
