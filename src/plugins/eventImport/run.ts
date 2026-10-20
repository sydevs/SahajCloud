/**
 * What one import run knows about itself, carried on `req.context` from the
 * task wrapper (`index.ts`) to the `before` and `after` hooks.
 *
 * ⚠ **The plugin's hooks receive the rows and `req`, nothing else** — not the
 * import document, not the uploader. The wrapper around the plugin's task is
 * what loads the document and puts it here, so the hooks can place rows under
 * the target the volunteer chose and report back to the one who uploaded.
 */

import type { ImportTarget } from './regions'
import type { PayloadRequest } from 'payload'

export const RUN_CONTEXT_KEY = 'eventImport'

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

export interface SkippedRow {
  /** The row's line in the volunteer's spreadsheet, header included (`csv/upload.ts`). */
  row: number
  reasons: string[]
  values: Record<string, string>
  missingCity?: MissingCity
  duplicateOf?: DuplicateOf
}

/** A row handed to the plugin to create, in the order the plugin creates them. */
export interface SubmittedRow {
  row: number
  values: Record<string, string>
}

export interface ImportRun {
  importId: number
  target: ImportTarget
  managerId: number | null
  defaultLanguages: string[]
  /** Rows the before hook passed on to be created, in row order. */
  submitted: SubmittedRow[]
  /** Rows the hooks refused or the plugin failed, in row order. */
  skipped: SkippedRow[]
  /** Classes the plugin created, summed over batches. */
  imported: number
  /** City regions under the target, by the Mapbox place id each holds. */
  cities: Map<string, number>
  /** Each class key a row of this file has claimed, and that row, so a later twin is caught. */
  claimed: Map<string, number>
}

export function runOf(req: PayloadRequest): ImportRun {
  const run = req.context?.[RUN_CONTEXT_KEY] as ImportRun | undefined
  if (!run) {
    throw new Error('Class import hooks were called outside the import task (no run context).')
  }
  return run
}
