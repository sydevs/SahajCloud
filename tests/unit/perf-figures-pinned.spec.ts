import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * **`tests/PERF.md` declares itself the single writer of every tier figure, and
 * nothing held it to that.** The budgets it governs drifted an order of
 * magnitude — `< 5 s` and "~1–2 s" described a 59 s lane — because a number no
 * command reports cannot go red (#990). This spec is that command.
 *
 * Three claims, each red on its own:
 *
 * 1. PERF.md's recorded file count equals the files on disk. This is the one
 *    figure a machine can settle without timing anything, and it is the proxy
 *    for the lane growing: 113 files carried `< 5 s` to 198 unnoticed.
 * 2. Every consumer doc states PERF.md's lane figure, so a re-measurement that
 *    stops at PERF.md reddens all four rather than passing quietly.
 * 3. Each tier target covers the measurement its own row is set from — Tier 2's
 *    cold gate, since `check.sh` starts Postgres, and Tier 1's slowest per-edit
 *    selection, since what the hook costs per edit is what that budget buys.
 *
 * ⚠ **Timings are deliberately not asserted.** A wall-clock bound in the lane
 * would redden on a loaded runner and teach everyone to ignore it. What is
 * pinned is agreement between the docs and between PERF.md and the tree.
 *
 * Re-measuring means editing PERF.md and the four consumers together. That
 * coupling is the point, not friction to route around.
 */

const ROOT = resolve(__dirname, '../..')

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')

/**
 * Counted off disk, not out of `git ls-files`: the lane collects what is
 * there, so an untracked spec runs and the index does not know it.
 * `vitest.config.mts` gives the unit project `tests/unit/**\/*.spec.ts`.
 */
function unitSpecCount(dir = resolve(ROOT, 'tests/unit')): number {
  return readdirSync(dir, { withFileTypes: true }).reduce(
    (total, entry) =>
      total +
      (entry.isDirectory()
        ? unitSpecCount(join(dir, entry.name))
        : entry.name.endsWith('.spec.ts')
          ? 1
          : 0),
    0,
  )
}

/** The one capture per figure. A miss throws here rather than asserting vacuously. */
function capture(source: string, label: string, pattern: RegExp): string {
  const match = source.match(pattern)
  if (!match) throw new Error(`tests/PERF.md no longer states ${label} as ${pattern}`)
  return match[1]
}

const PERF = read('tests/PERF.md')

const figures = {
  files: Number(capture(PERF, 'the file count', /\| Files \/ tests \| (\d+) \/ \d+ \|/)),
  tests: Number(capture(PERF, 'the test count', /\| Files \/ tests \| \d+ \/ (\d+) \|/)),
  lane: capture(PERF, 'the whole-lane median', /\| Whole lane,[^|]*\| \*\*([\d.]+) s\*\* \|/),
  gateCold: Number(
    capture(PERF, "the gate's cold figure", /\| Tier 2 lean gate[^|]*\| \*\*(\d+) s\*\* cold/),
  ),
  slowestEdit: Number(
    capture(
      PERF,
      'the slowest per-edit selection',
      /\| Slowest per-edit selection[^|]*\| \*\*([\d.]+) s\*\* \|/,
    ),
  ),
}

/** Rounded, because a doc quotes "59 s" where PERF.md records 59.2 s. */
const laneSeconds = Math.round(Number(figures.lane))

/** Every file the PERF.md invariant names. Add a consumer here when one starts quoting a figure. */
const CONSUMERS = ['docs/rules/testing-reqs.md', 'tests/AGENTS.md', 'AGENTS.md', 'README.md']

/** A tier's own row of the three-tier contract, so a target is read from the tier it belongs to. */
function tierRow(tier: string): string {
  const row = read('docs/rules/testing-reqs.md').match(
    new RegExp(`\\| \\*\\*${tier}\\*\\* \\|[^\\n]*`),
  )
  if (!row) throw new Error(`the three-tier contract no longer has a ${tier} row`)
  return row[0]
}

describe('tests/PERF.md is the single writer of every tier figure', () => {
  it('records the number of unit specs actually tracked', () => {
    expect(figures.files).toBe(unitSpecCount())
  })

  it.each(CONSUMERS)('%s states PERF.md’s lane figure', (path) => {
    expect(read(path)).toContain(`${laneSeconds} s`)
  })

  it.each(CONSUMERS)('%s contradicts none of PERF.md’s counts', (path) => {
    const doc = read(path)
    const counts = [
      ...[...doc.matchAll(/(\d{2,4}) files/g)].map((m) => [m[0], figures.files] as const),
      ...[...doc.matchAll(/(\d{3,5}) (?:tests|cases)/g)].map((m) => [m[0], figures.tests] as const),
    ]
    for (const [stated, canonical] of counts) {
      expect(Number(stated.match(/\d+/)![0]), `"${stated}" in ${path}`).toBe(canonical)
    }
  })

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
