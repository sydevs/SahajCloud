/**
 * `ensureVirtualFieldDeps` — the beforeOperation hook that puts a computed
 * field's stored inputs back into an include-mode `select`.
 *
 * Pure: it reads and rewrites the operation's own arguments, so no booted
 * collection is needed. What each collection declares is pinned where that
 * collection's reads are — `tests/int/events.int.spec.ts` and
 * `tests/int/meditation-transcripts.int.spec.ts`.
 *
 * Fixture pre-mortem: the cases assume Payload hands the hook
 * `{ operation, args }` with the caller's `select` on `args`, and maps
 * `find`/`findByID` onto the `find` and `read` operations. Verified against
 * `src/collections/Events/Events.ts`, which has depended on exactly that since
 * the hook's first version, and against `payload`'s `CollectionBeforeOperationHook`.
 */
import type { CollectionBeforeOperationHook } from 'payload'

import { describe, expect, it } from 'vitest'

import { ensureVirtualFieldDeps } from '@/lib/utilities/virtualFieldDeps'

const hook = ensureVirtualFieldDeps({ status: ['segments', 'job'], error: ['job'] })

type Args = Parameters<CollectionBeforeOperationHook>[0]

/**
 * The `select` the hook leaves behind. `args` is a union of every operation's
 * own arguments, and only some carry a `select`, so both ends are cast — the
 * hook reads the key off whatever it is handed.
 */
const run = (operation: string, select?: unknown): unknown => {
  const args = { select } as Args['args']
  const patched = hook({ operation, args } as Args) as { select?: unknown }
  return patched.select
}

describe('ensureVirtualFieldDeps', () => {
  it('adds the inputs a requested computed field reads', () => {
    expect(run('find', { status: true })).toEqual({ status: true, segments: true, job: true })
  })

  it('adds only what the requested field declares', () => {
    expect(run('find', { error: true })).toEqual({ error: true, job: true })
  })

  it('keeps everything the caller asked for', () => {
    expect(run('read', { status: true, audioFilename: true })).toEqual({
      status: true,
      audioFilename: true,
      segments: true,
      job: true,
    })
  })

  it('leaves an input the caller already decided alone', () => {
    // `segments: false` is the caller's own exclusion. Overwriting it would
    // make the hook widen a response nobody asked to widen.
    expect(run('find', { status: true, segments: false })).toEqual({
      status: true,
      segments: false,
      job: true,
    })
  })

  it('leaves a select naming no computed field untouched', () => {
    const select = { audioFilename: true }

    expect(run('find', select)).toBe(select)
  })

  it('leaves a read with no select alone, so it still returns every field', () => {
    expect(run('find')).toBeUndefined()
  })

  it('ignores an operation that selects nothing', () => {
    // A write's `args` carry no `select`, and `count` reads no fields.
    expect(run('create', { status: true })).toEqual({ status: true })
    expect(run('count', { status: true })).toEqual({ status: true })
  })

  it('ignores a select that is not an object', () => {
    expect(run('find', 'status')).toBe('status')
  })
})
