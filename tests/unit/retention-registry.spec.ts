/**
 * The registry's own invariants (#987). What each entry *deletes* is pinned
 * beside it — `submission-retention.spec.ts` and `job-retention.spec.ts` for the
 * windows, the `retention-*.int.spec.ts` files for the sweep. This file is about
 * the shape the registry has to keep for those to mean anything.
 */
import type { Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { NO_RETENTION, RETENTION_REGISTRY } from '@/jobs/SweepRetention/registry'
import { SweepRetention } from '@/jobs/SweepRetention/SweepRetention'

const fieldNames = (fields: Field[] | undefined) =>
  (fields ?? []).map((field) => ('name' in field ? field.name : undefined))

describe('the retention registry', () => {
  it('sweeps every collection from one nightly task', () => {
    expect(SweepRetention.schedule).toEqual([{ cron: '0 4 * * *', queue: 'nightly' }])
  })

  /**
   * ⚠ An entry with no window sweeps nothing and reports zero, which reads
   * exactly like a collection that had nothing due.
   */
  it('gives every entry at least one window', () => {
    for (const entry of RETENTION_REGISTRY) {
      expect(entry.windows.length).toBeGreaterThan(0)
    }
  })

  it('names each collection once', () => {
    const slugs = RETENTION_REGISTRY.map((entry) => entry.collection)

    expect([...new Set(slugs)]).toEqual(slugs)
  })

  /**
   * Both lists are read by a person deciding whether a collection's retention is
   * settled, so a collection in both would answer that question twice.
   */
  it('excuses no collection it also sweeps', () => {
    for (const entry of RETENTION_REGISTRY) {
      expect(Object.keys(NO_RETENTION)).not.toContain(entry.collection)
    }
  })

  /**
   * ⚠ The reason is the whole value of `NO_RETENTION`. A bare slug would read as
   * a decision taken while recording none, which is what an absent collection
   * already means.
   */
  it('gives every excused collection a reason', () => {
    for (const [collection, reason] of Object.entries(NO_RETENTION)) {
      expect(reason.length, collection).toBeGreaterThan(40)
    }
  })

  /**
   * The three task slugs this one replaced each carried their own `dryRun`, so
   * an operator reviewing a window before it deletes keeps that. `collection`
   * is what replaces the three separately queueable rows the admin Jobs UI used
   * to show.
   */
  it('offers a dry run and a single-collection run', () => {
    expect(fieldNames(SweepRetention.inputSchema)).toEqual(
      expect.arrayContaining(['dryRun', 'collection']),
    )
  })

  /**
   * ⚠ Per-collection counts, not a total: a registry cannot name its counters
   * in a static `outputSchema`, and a total alone cannot tell "nothing was due"
   * apart from "that entry never ran".
   */
  it('reports a count per collection', () => {
    const collections = (SweepRetention.outputSchema ?? []).find(
      (field) => 'name' in field && field.name === 'collections',
    )

    expect(collections?.type).toBe('array')
    expect(fieldNames(collections && 'fields' in collections ? collections.fields : [])).toEqual([
      'collection',
      'deleted',
    ])
  })
})
