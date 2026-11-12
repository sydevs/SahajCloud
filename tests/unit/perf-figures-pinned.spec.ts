import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Each tier target in the three-tier contract must cover the measurement its own row is set from
 * in `tests/PERF.md`. The budgets once drifted an order of magnitude — `< 5 s` described a 59 s
 * lane — because no command compared them to a run (#990).
 *
 * ⚠ **Timings are deliberately not asserted.** A wall-clock bound in the lane would redden on a
 * loaded runner and teach everyone to ignore it.
 *
 * Lane file and test counts are deliberately not pinned either: pinning them made every PR that
 * added a spec edit PERF.md and four docs. Docs point at PERF.md instead of quoting the counts.
 */

const ROOT = resolve(__dirname, '../..')

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')

/**
 * The one capture per figure. A miss throws here rather than asserting vacuously. ⚠ Every pattern
 * tolerates whitespace around a cell's pipes: prettier pads a table's columns to its widest cell.
 */
function capture(source: string, label: string, pattern: RegExp): string {
  const match = source.match(pattern)
  if (!match) throw new Error(`tests/PERF.md no longer states ${label} as ${pattern}`)
  return match[1]
}

const PERF = read('tests/PERF.md')

const figures = {
  gateCold: Number(
    capture(PERF, "the gate's cold figure", /\|\s*Tier 2 lean gate[^|]*\|\s*\*\*(\d+) s\*\* cold/),
  ),
  slowestEdit: Number(
    capture(
      PERF,
      'the slowest per-edit selection',
      /\|\s*Slowest per-edit selection[^|]*\|\s*\*\*([\d.]+) s\*\*\s*\|/,
    ),
  ),
}

/** A tier's own row of the three-tier contract, so a target is read from the tier it belongs to. */
function tierRow(tier: string): string {
  const row = read('docs/rules/testing-reqs.md').match(
    new RegExp(`\\|\\s*\\*\\*${tier}\\*\\*\\s*\\|[^\\n]*`),
  )
  if (!row) throw new Error(`the three-tier contract no longer has a ${tier} row`)
  return row[0]
}

describe('each tier target covers its measurement in tests/PERF.md', () => {
  it('gives Tier 2 a target the gate named in its own row can meet', () => {
    const target = Number(capture(tierRow('2 — Pre-PR'), "Tier 2's target", /< (\d+) s/))
    expect(target).toBeGreaterThanOrEqual(figures.gateCold)
  })

  /**
   * Tier 1's target is what one edit may cost, so the lane's own 47–78 s is not
   * what it bounds — the specs the hook selects are (#993). Pinning it to the
   * slowest recorded selection is what stops the target drifting back to a
   * figure no hook can meet, which is how `< 5 s` outlived its own lane.
   */
  it('gives Tier 1 a target the slowest recorded edit can meet', () => {
    const target = Number(capture(tierRow('1 — Hook'), "Tier 1's target", /< (\d+) s/))
    expect(target).toBeGreaterThanOrEqual(figures.slowestEdit)
  })
})
