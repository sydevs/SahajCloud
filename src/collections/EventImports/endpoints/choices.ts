import type { CommitRow } from '../commit/rows'
import type { Endpoint } from 'payload'

import { z } from 'zod'

import { parseBody, requireActiveManager } from '@/lib/endpoints'
import { relationId } from '@/lib/utilities/relationId'
import type { EventImport } from '@/payload-types'

import {
  batchIdOf,
  failure,
  refuseRevokedRole,
  refuseUnownedTarget,
} from '../batchRequest'
import { MAX_IMPORT_ROWS } from '../constants'
import { busy, renewLease, withLease } from '../lease'

const bodySchema = z
  .object({
    inviteCoordinators: z.boolean().optional(),
    duplicates: z
      .array(
        z.object({
          line: z.int().positive(),
          action: z.enum(['skip', 'import', 'overwrite']),
        }),
      )
      .max(MAX_IMPORT_ROWS)
      .optional(),
  })
  .refine((body) => body.inviteCoordinators !== undefined || body.duplicates !== undefined, {
    message: 'Send inviteCoordinators, duplicates, or both.',
  })

/**
 * POST /api/event-imports/:id/choices
 *
 * Records the two decisions a reviewer makes about rows rather than regions:
 * what to do with each duplicate (skip it, import it anyway, or overwrite the
 * class it repeats), and whether the commit may email the batch's coordinators
 * an invitation.
 *
 * ⚠ **Both default to doing nothing.** A duplicate with no choice is skipped,
 * and coordinators are not emailed unless this says so — an import must not
 * mail strangers, or rewrite a class somebody else keeps, because nobody looked.
 *
 * ⚠ **`overwrite` is only offered against a class the CMS holds.** A row that
 * repeats an earlier line of the same file has nothing to overwrite but its own
 * neighbour, so it may be skipped or imported, nothing else.
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard serves published API
 * `clients`; this is an admin-panel action by an authenticated `manager` on a
 * batch they uploaded, reached only from a region's Import tab. Which batch the
 * caller may touch comes from the collection's own `access` (`access.ts`); the
 * role and subtree checks are re-run because the write that follows elevates
 * past both.
 */
export const recordEventImportChoices: Endpoint = {
  path: '/:id/choices',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const id = batchIdOf(req)
    if (id === null) return failure('A numeric batch id is required.', 400)

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response

    const probe = (await req.payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
      select: { status: true, targetRegion: true, uploadLocale: true },
      req,
    })) as EventImport | null
    if (!probe) return failure('No such import batch.', 404)

    const revoked = refuseRevokedRole(req, probe)
    if (revoked) return revoked

    const targetId = relationId(probe.targetRegion)
    if (targetId === null) return failure('This batch names no target region.', 409)
    const unowned = await refuseUnownedTarget(req, targetId)
    if (unowned) return unowned

    return withLease(req, id, async (token) => {
      // Re-read under the lease: a commit that started between the probe and
      // the claim has moved the status, and its rows are the ones to refuse.
      const batch = (await req.payload.findByID({
        collection: 'event-imports',
        id,
        depth: 0,
        overrideAccess: true,
        select: { status: true, rows: true },
        req,
      })) as EventImport
      if (batch.status === 'committing' || batch.status === 'finished') {
        return failure('This batch is being committed, so its choices can no longer change.', 409)
      }

      const rows = (batch.rows ?? []) as CommitRow[]
      const applied = applyDuplicateChoices(rows, parsed.data.duplicates ?? [])
      if (!applied.ok) return failure(applied.error, 422)

      if (!(await renewLease(req, id, token))) return busy()
      await req.payload.update({
        collection: 'event-imports',
        id,
        data: {
          rows,
          ...(parsed.data.inviteCoordinators === undefined
            ? {}
            : { inviteCoordinators: parsed.data.inviteCoordinators }),
        },
        overrideAccess: true,
        depth: 0,
        select: { status: true },
        req,
      })
      return Response.json({ ok: true })
    })
  },
}

type DuplicateChoice = { line: number; action: 'import' | 'overwrite' | 'skip' }

/**
 * Write each choice onto its row, or refuse them all.
 *
 * All or nothing, like the tree edits: half-applied choices would render back
 * as the reviewer's own, and they could not tell which of theirs were dropped.
 */
export function applyDuplicateChoices(
  rows: CommitRow[],
  choices: readonly DuplicateChoice[],
): { ok: true } | { ok: false; error: string } {
  const byLine = new Map(rows.map((row) => [row.line, row]))
  for (const { line, action } of choices) {
    const duplicate = byLine.get(line)?.duplicate
    if (!duplicate) return { ok: false, error: `Line ${line} is not a duplicate.` }
    if (action === 'overwrite' && duplicate.eventId === undefined) {
      return {
        ok: false,
        error: `Line ${line} repeats line ${duplicate.line ?? '?'} of this file, so there is no class to overwrite.`,
      }
    }
  }
  for (const { line, action } of choices) byLine.get(line)!.duplicate!.action = action
  return { ok: true }
}
