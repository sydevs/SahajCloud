/**
 * What the Pages sidebar table says about where a page is available
 * (`src/components/admin/PageAvailability`). Which configuration places a page
 * is `page-services.spec.ts`; this is only the reading that follows.
 */
import { describe, expect, it } from 'vitest'

import { pageAvailability } from '@/components/admin/PageAvailability/availability'

const named = (service: 'app' | 'web') => ({ service, placement: { by: 'name' } }) as const
const tagged = (service: 'app' | 'web', tag: string) =>
  ({ service, placement: { by: 'tag', tag } }) as const

describe('the availability table', () => {
  it('names what placed a published page in each service, and asks for nothing', () => {
    const { rows, hint } = pageAvailability(true, [tagged('web', 'wisdom'), named('app')])
    expect(rows).toEqual([
      {
        service: 'web',
        label: 'Website',
        status: 'Available',
        tone: 'success',
        note: 'Tagged “wisdom”',
      },
      {
        service: 'app',
        label: 'App',
        status: 'Available',
        tone: 'success',
        note: 'Named in its configuration',
      },
    ])
    // Placed in both, so there is nothing left to name it in.
    expect(hint).toBeUndefined()
  })

  it('leaves a service that carries the page alone, and says where to place the other', () => {
    const { rows, hint } = pageAvailability(true, [named('web')])
    expect(rows[1]).toEqual({ service: 'app', label: 'App', status: 'Not placed', tone: 'neutral' })
    expect(hint).toContain('We Meditate App › Configuration')
    expect(hint).not.toContain('We Meditate Web')
  })

  it('colours both rows amber when no configuration places a published page', () => {
    const { rows, hint } = pageAvailability(true, [])
    expect(rows.map((row) => [row.status, row.tone])).toEqual([
      ['Not placed', 'warning'],
      ['Not placed', 'warning'],
    ])
    expect(hint).toContain('We Meditate Web › Configuration')
    expect(hint).toContain('We Meditate App › Configuration')
  })

  it('reports publish as the blocker on a placed row, and placement on the other', () => {
    const { rows, hint } = pageAvailability(false, [tagged('app', 'technique')])
    expect(rows[0]).toEqual({
      service: 'web',
      label: 'Website',
      status: 'Not placed',
      tone: 'neutral',
    })
    expect(rows[1]).toEqual({
      service: 'app',
      label: 'App',
      status: 'Not published',
      tone: 'warning',
      note: 'Tagged “technique”',
    })
    expect(hint).toContain('We Meditate Web › Configuration')
  })

  it('asks for a placement first when a draft has none', () => {
    const { rows, hint } = pageAvailability(false, [])
    expect(rows.every((row) => row.status === 'Not placed')).toBe(true)
    expect(hint).toContain('We Meditate Web › Configuration')
  })
})
