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

export interface SkippedRow {
  /** 1-based data row, header excluded — the number the plugin's own issues use. */
  row: number
  reasons: string[]
  values: Record<string, string>
  missingCity?: MissingCity
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
}

export function runOf(req: PayloadRequest): ImportRun {
  const run = req.context?.[RUN_CONTEXT_KEY] as ImportRun | undefined
  if (!run) {
    throw new Error('Class import hooks were called outside the import task (no run context).')
  }
  return run
}
