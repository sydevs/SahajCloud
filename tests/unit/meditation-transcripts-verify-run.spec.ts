/**
 * The `meditation-transcripts` run invariant — every entry in the data file
 * ended in a write, an error, or a skip that named its reason.
 *
 * It is what this script asserts in place of a database floor: how many of the
 * 126 transcripts import depends on which recordings the target library still
 * carries, so no count can be stated ahead of a run. The arithmetic is pure
 * and lives beside the importer, so both directions are reachable here without
 * a Payload boot — the importer half is driven in
 * `tests/int/meditation-transcripts-seed.int.spec.ts`.
 */
import { describe, expect, it } from 'vitest'

import { verifyEntriesAccountedFor } from '../../seeds/meditation-transcripts/import'

const ZERO = { created: 0, updated: 0, skipped: 0, errors: 0, unresolved: 0 }

describe('verifyEntriesAccountedFor', () => {
  it('passes when every entry ended somewhere', () => {
    expect(
      verifyEntriesAccountedFor({
        ...ZERO,
        entries: 10,
        created: 4,
        updated: 2,
        skipped: 1,
        errors: 1,
        unresolved: 2,
      }),
    ).toEqual({ failures: [] })
  })

  it('fails when an entry reached no outcome, and names every total', () => {
    const { failures } = verifyEntriesAccountedFor({
      ...ZERO,
      entries: 126,
      created: 120,
      unresolved: 3,
    })

    expect(failures).toHaveLength(1)
    // The numbers are the diagnosis: which disposition is short is the first
    // question an operator asks, and a bare "3 unaccounted for" cannot answer it.
    expect(failures[0]).toBe(
      '126 entries, 123 accounted for: 120 created, 0 updated, 0 skipped, 0 errors, 3 unresolved.',
    )
  })

  it('fails when an entry was counted twice', () => {
    expect(verifyEntriesAccountedFor({ ...ZERO, entries: 2, created: 2, skipped: 1 }).failures)
      .toHaveLength(1)
  })

  it('passes an empty data file, which has nothing to account for', () => {
    expect(verifyEntriesAccountedFor({ ...ZERO, entries: 0 })).toEqual({ failures: [] })
  })
})
