/**
 * What the two surfaces of one atlas home call a "program".
 *
 * The Total programs tile and the Programs column beside it read the same
 * scope, so they owe a reader the same number. They did not: the tile counted
 * every event in scope, `finished` included, while the column counted only the
 * ones that are not — so an admin read one total in the tile and a different
 * sum down the Countries table.
 *
 * `isProgramStage` is now the single definition and this pins the agreement
 * over one event set, rather than each surface's arithmetic separately.
 */
import { describe, expect, it } from 'vitest'

import { rollUpRegionMetrics } from '@/lib/atlasOverview/regions'
import { countPrograms, isProgramStage } from '@/lib/atlasOverview/status'

/** One region, five listings, one of them finished. */
const STAGES = ['verified', 'reminded', 'escalated', 'unverified', 'finished']

const REGION_ID = 7

const events = STAGES.map((stage) => ({
  hasManager: true,
  regionId: REGION_ID,
  signupsNow: 0,
  signupsPrevious: 0,
  stage,
}))

const byStage: Record<string, number> = {}
for (const stage of STAGES) byStage[stage] = (byStage[stage] ?? 0) + 1

describe('what counts as a program', () => {
  it('excludes a finished listing and nothing else', () => {
    expect(isProgramStage('finished')).toBe(false)
    for (const stage of STAGES.filter((s) => s !== 'finished')) {
      expect(isProgramStage(stage)).toBe(true)
    }
  })

  it('gives the tile and the overview column the same number', () => {
    const rolledUp = rollUpRegionMetrics(events, new Map(), new Set([REGION_ID]))

    expect(countPrograms(byStage)).toBe(4)
    expect(rolledUp.get(REGION_ID)?.programs).toBe(countPrograms(byStage))
  })

  it("leaves a snapshot's finished count out of the comparison", () => {
    // A snapshot row holds every stage, so the 30-day comparison is taken over
    // the same subset as the live value, or the change line reports a listing
    // finishing as a program disappearing.
    expect(countPrograms({ finished: 12, verified: 3 })).toBe(3)
  })
})
