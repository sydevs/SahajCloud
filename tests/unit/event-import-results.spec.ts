import { describe, expect, it } from 'vitest'

import { buildResults } from '@/plugins/eventImport/results'

const values = (title: string) => ({ title, city: 'London' })

describe('buildResults', () => {
  it('lines created classes up with the rows that were not skipped, in row order', () => {
    const { rows, matched } = buildResults(
      [
        { row: 1, values: values('One') },
        { row: 3, values: values('Three') },
        { row: 4, values: values('Four') },
      ],
      [
        { row: 2, reasons: ['the address could not be found'], values: values('Two') },
        {
          row: 3,
          reasons: ['repeats the class "Old" already listed'],
          values: values('Three'),
          duplicateOf: { eventId: 9, title: 'Old' },
        },
      ],
      [101, 104],
    )

    expect(matched).toBe(true)
    expect(rows.map(({ row, outcome, eventId }) => [row, outcome, eventId])).toEqual([
      [1, 'created', 101],
      [2, 'error', undefined],
      [3, 'duplicate', undefined],
      [4, 'created', 104],
    ])
    expect(rows[1]).toMatchObject({
      values: values('Two'),
      reasons: ['the address could not be found'],
    })
  })

  it('links no class when the counts disagree, rather than a wrong one', () => {
    const { rows, matched } = buildResults(
      [
        { row: 1, values: values('One') },
        { row: 2, values: values('Two') },
      ],
      [],
      [101],
    )
    expect(matched).toBe(false)
    expect(rows.every(({ eventId }) => eventId === undefined)).toBe(true)
  })
})
