import { describe, expect, it } from 'vitest'

import { sweepTargets } from '../../scripts/preview-domain-plan'

/**
 * Which preview addresses the daily sweep deletes.
 *
 * ⚠ **The sweep is load-bearing, not hygiene.** A zone holds 100 Workers
 * Custom Domains, so a sweep that under-deletes eventually stops every new
 * preview getting an address. It is also irreversible in the other direction:
 * deleting an open PR's address takes a live preview down, and the Advanced
 * Certificate a recreate generates is not reclaimed. Both halves are asserted.
 */
const DAY_MS = 24 * 60 * 60_000
const NOW = Date.parse('2026-11-05T12:00:00Z')

const domain = (pr: number) => ({
  hostname: `pr-${pr}.cloud-preview.sydevelopers.com`,
  id: `d${pr}`,
})
const plan = (
  domains: { hostname: string; id: string }[],
  pullRequests: { closedAt: null | string; number: number }[],
) => sweepTargets({ domains, graceMs: DAY_MS, now: NOW, pullRequests })

describe('sweepTargets', () => {
  it('deletes the address of a PR closed more than a day ago', () => {
    const targets = plan([domain(1)], [{ closedAt: '2026-11-01T00:00:00Z', number: 1 }])

    expect(targets.map((t) => t.hostname)).toEqual(['pr-1.cloud-preview.sydevelopers.com'])
    expect(targets[0]!.domainId).toBe('d1')
  })

  it('keeps an open PR however old it is', () => {
    // The long-running PR is exactly the one a reviewer comes back to, so age
    // alone is never a reason.
    expect(plan([domain(2)], [{ closedAt: null, number: 2 }])).toEqual([])
  })

  it('keeps a PR closed inside the grace window', () => {
    // A PR reopened within the day keeps its address, and its certificate.
    const justClosed = new Date(NOW - DAY_MS / 2).toISOString()

    expect(plan([domain(3)], [{ closedAt: justClosed, number: 3 }])).toEqual([])
  })

  it('leaves an address alone when GitHub said nothing about its PR', () => {
    // ⚠ Never having looked is not evidence of absence. A failed read, or a
    // number from another repository, reads exactly like a closed PR — and
    // deleting on that unknown takes a live preview down.
    expect(plan([domain(4)], [])).toEqual([])
  })

  it('ignores a hostname that names no PR', () => {
    expect(plan([{ hostname: 'docs.cloud-preview.sydevelopers.com', id: 'dx' }], [])).toEqual([])
  })

  it('refuses an unparseable close timestamp rather than guessing', () => {
    expect(plan([domain(5)], [{ closedAt: 'last tuesday', number: 5 }])).toEqual([])
  })
})
