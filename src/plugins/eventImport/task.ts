/**
 * The job that turns an import's rows into draft classes, one at a time, as
 * the uploader.
 *
 * Each class is created in its own transaction (no `req` is passed), so a row
 * Payload refuses costs that row alone, and every create sees the rows before
 * it — the duplicate rule catches a twin within the file as well as one
 * already listed.
 *
 * ⚠ **Only a miss or a refusal is about a row.** The geocoder being down, or
 * the target gone, fails the whole import with that sentence, keeping whatever
 * was already created so it can still be published or cleaned up.
 */

import type { ImportRow, ImportRun, SkippedRow } from './run'
import type { PayloadRequest, TaskConfig } from 'payload'

import { APIError, ValidationError } from 'payload'

import { ExpectedJobFailure } from '@/lib/jobs/expectedFailure'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import type { Import } from '@/payload-types'
import { hydrateLocalizedRoles } from '@/plugins/access'

import { failImport, finishImport } from './finish'
import { prepareRows } from './prepare'
import { cityIndex, loadTarget } from './regions'
import { RUN_CONTEXT_KEY } from './run'
import { reasonsOf } from './validate'

export const IMPORT_TASK = 'importEvents'

export const importEventsTask: TaskConfig<'importEvents'> = {
  slug: IMPORT_TASK,
  label: 'Import Events',
  // A rerun would create every row again; a failed import is uploaded again.
  retries: 0,
  inputSchema: [{ name: 'importId', type: 'number', required: true }],
  handler: async ({ input, req }) => {
    const importId = Number(input.importId)
    let run: ImportRun | undefined
    try {
      const started = await startRun(req, importId)
      run = started.run
      for (const { row, data } of await prepareRows(req, run, started.rows)) {
        await createRow(req, run, row, data)
      }
      await finishImport(req, run)
    } catch (error) {
      await failImport(req, importId, error, run)
      throw error
    }
    return { output: {} }
  },
}

async function startRun(req: PayloadRequest, importId: number) {
  const batch = (await req.payload.findByID({
    collection: 'imports',
    id: importId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as Import
  const target = await loadTarget(req, relationId(batch.targetRegion) ?? 0)
  if (!target) {
    throw new ExpectedJobFailure('The target region no longer exists. Start a new import.')
  }
  const uploaderId = relationId(batch.manager)
  const uploader =
    uploaderId === null
      ? null
      : await req.payload.findByID({
          collection: 'managers',
          id: uploaderId,
          depth: 0,
          overrideAccess: true,
          disableErrors: true,
          req,
        })
  if (!uploader || uploader.type === 'inactive') {
    throw new ExpectedJobFailure(
      'The manager who uploaded this import is no longer active. Start a new import.',
    )
  }
  const run: ImportRun = {
    importId,
    target,
    // Their roles in every locale, as a signed-in request carries them: the
    // creates check the role the uploader holds in the import's locale.
    uploader: {
      ...uploader,
      collection: 'managers',
      roles: await hydrateLocalizedRoles(req.payload, uploader.id, localeIsolatedReq(req)),
    } as unknown as ImportRun['uploader'],
    locale: batch.uploadLocale ?? undefined,
    defaultLanguages: (batch.defaultLanguages ?? []) as string[],
    created: [],
    skipped: [],
    cities: await cityIndex(req, target.id),
    claimed: new Map(),
  }
  return { run, rows: batch.rows ?? [] }
}

async function createRow(
  req: PayloadRequest,
  run: ImportRun,
  row: ImportRow,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const doc = await req.payload.create({
      collection: 'events',
      data: data as never,
      draft: true,
      depth: 0,
      user: run.uploader,
      overrideAccess: false,
      locale: run.locale as never,
      context: { [RUN_CONTEXT_KEY]: true },
    })
    run.created.push({ ...row, eventId: doc.id })
  } catch (error) {
    run.skipped.push({ ...row, ...refusalOf(run, error) })
  }
}

/** Why Payload refused a row, in the volunteer's words where Payload's are not. */
function refusalOf(run: ImportRun, error: unknown): Omit<SkippedRow, keyof ImportRow> {
  if (error instanceof ValidationError) return { reasons: reasonsOf(error.data.errors) }
  if (error instanceof APIError && error.status === 403) {
    return {
      reasons: [
        "you are not allowed to add classes in this row's city — ask an admin, or remove the row",
      ],
    }
  }
  const twin = (error as APIError<{ code?: string; eventId?: number }>).data
  if (twin?.code === 'duplicate_class' && twin.eventId !== undefined) {
    const earlier = run.created.find(({ eventId }) => eventId === twin.eventId)
    return {
      reasons: [(error as Error).message],
      duplicateOf: earlier ? { row: earlier.row } : { eventId: twin.eventId },
    }
  }
  if (error instanceof Error) return { reasons: [error.message] }
  return { reasons: [String(error)] }
}
