import { describe, expect, it } from 'vitest'

import { planRespelledSlugs } from '../../scripts/respell-region-slugs-plan'

describe('planRespelledSlugs', () => {
  it('re-spells a slug generated from the name', () => {
    const plan = planRespelledSlugs([
      { id: 1, name: 'Universität Trier', slug: 'universitat-trier' },
    ])
    expect(plan.renames).toEqual([
      { id: 1, name: 'Universität Trier', from: 'universitat-trier', to: 'universität-trier' },
    ])
  })

  it('keeps a disambiguating suffix', () => {
    const plan = planRespelledSlugs([{ id: 1, name: 'София', slug: 'sofiya-2' }])
    expect(plan.renames[0]?.to).toBe('софия-2')
  })

  it('leaves ASCII names, and slugs already re-spelled', () => {
    const plan = planRespelledSlugs([
      { id: 1, name: 'Amsterdam', slug: 'amsterdam' },
      { id: 2, name: 'München', slug: 'münchen' },
      { id: 3, name: 'Zürich', slug: 'zürich-switzerland' },
    ])
    expect(plan).toEqual({ renames: [], collisions: [], unmatched: [] })
  })

  it('reports a slug that was not generated from the name', () => {
    const plan = planRespelledSlugs([{ id: 1, name: 'Germany', slug: 'de' }])
    expect(plan).toEqual({ renames: [], collisions: [], unmatched: [] })
    const handSet = planRespelledSlugs([{ id: 1, name: 'Düsseldorf', slug: 'dus' }])
    expect(handSet.unmatched).toEqual([{ id: 1, name: 'Düsseldorf', slug: 'dus' }])
  })

  it('skips a rename onto a slug another region holds', () => {
    const plan = planRespelledSlugs([
      { id: 1, name: 'Köln', slug: 'koln' },
      { id: 2, name: 'Köln Mitte', slug: 'köln' },
    ])
    expect(plan.collisions.map((change) => change.id)).toEqual([1])
    expect(plan.renames).toEqual([])
  })

  it('plans in id order', () => {
    const plan = planRespelledSlugs([
      { id: 2, name: 'Bärlin', slug: 'barlin' },
      { id: 1, name: 'BÄRLIN', slug: 'barlin-2' },
    ])
    expect(plan.renames.map((change) => change.to)).toEqual(['bärlin-2', 'bärlin'])
  })
})
