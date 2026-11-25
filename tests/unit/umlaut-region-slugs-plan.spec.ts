import { describe, expect, it } from 'vitest'

import { planUmlautSlugs } from '../../scripts/umlaut-region-slugs-plan'

describe('planUmlautSlugs', () => {
  it('re-spells a slug generated from the name', () => {
    const plan = planUmlautSlugs([{ id: 1, name: 'Universität Trier', slug: 'universitat-trier' }])
    expect(plan.renames).toEqual([
      { id: 1, name: 'Universität Trier', from: 'universitat-trier', to: 'universitaet-trier' },
    ])
  })

  it('keeps a disambiguating suffix', () => {
    const plan = planUmlautSlugs([{ id: 1, name: 'Köln', slug: 'koln-2' }])
    expect(plan.renames[0]?.to).toBe('koeln-2')
  })

  it('leaves names without umlauts, and slugs already re-spelled', () => {
    const plan = planUmlautSlugs([
      { id: 1, name: 'Straße', slug: 'strasse' },
      { id: 2, name: 'München', slug: 'muenchen' },
      { id: 3, name: 'Zürich', slug: 'zuerich-switzerland' },
    ])
    expect(plan).toEqual({ renames: [], collisions: [], unmatched: [] })
  })

  it('reports a slug that was not generated from the name', () => {
    const plan = planUmlautSlugs([{ id: 1, name: 'Düsseldorf', slug: 'dus' }])
    expect(plan.unmatched).toEqual([{ id: 1, name: 'Düsseldorf', slug: 'dus' }])
    expect(plan.renames).toEqual([])
  })

  it('skips a rename onto a slug another region holds', () => {
    const plan = planUmlautSlugs([
      { id: 1, name: 'Köln', slug: 'koln' },
      { id: 2, name: 'Koeln', slug: 'koeln' },
    ])
    expect(plan.collisions.map((change) => change.id)).toEqual([1])
    expect(plan.renames).toEqual([])
  })

  it('skips a rename onto a slug that another rename vacates', () => {
    const plan = planUmlautSlugs([
      { id: 1, name: 'Äa', slug: 'aa' },
      { id: 2, name: 'Äeä', slug: 'aea' },
    ])
    expect(plan.collisions.map((change) => change.id)).toEqual([1])
    expect(plan.renames.map((change) => change.id)).toEqual([2])
  })

  it('plans in id order', () => {
    const plan = planUmlautSlugs([
      { id: 2, name: 'Bärlin', slug: 'barlin' },
      { id: 1, name: 'BÄRLIN', slug: 'barlin-2' },
    ])
    expect(plan.renames.map((change) => change.to)).toEqual(['baerlin-2', 'baerlin'])
  })
})
