import { describe, expect, it } from 'vitest'

import { buildResults } from '@/plugins/eventImport/results'

const values = (title: string) => ({ title, city: 'London' })

describe('buildResults', () => {
  it('lists every row in spreadsheet order, created with its class and skipped with why', () => {
    const rows = buildResults(
      [
        { row: 4, values: values('Four'), eventId: 104 },
        { row: 1, values: values('One'), eventId: 101 },
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
    )

    expect(rows.map(({ row, outcome, eventId }) => [row, outcome, eventId])).toEqual([
      [1, 'created', 101],
      [2, 'error', undefined],
      [3, 'duplicate', undefined],
      [4, 'created', 104],
    ])
    // A skipped row keeps what was uploaded, to download, fix and upload again.
    expect(rows[1]).toMatchObject({
      values: values('Two'),
      reasons: ['the address could not be found'],
    })
    expect(rows[0]).not.toHaveProperty('values')
  })
})
