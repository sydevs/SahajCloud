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
        { row: 3, reasons: ['This class repeats #9 "Old": same type…'], values: values('Three') },
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
    expect(rows[1]).toMatchObject({ values: values('Two'), reasons: ['the address could not be found'] })
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

describe('importErrorMessage', () => {
  it('names the line and the fix for a row split on an unquoted comma', async () => {
    const { importErrorMessage } = await import('@/plugins/eventImport/finish')
    expect(
      importErrorMessage(new Error('Invalid Record Length: columns length is 26, got 27 on line 4')),
    ).toBe(
      'Line 4 has 27 values but the header has 26 columns. A value that contains a comma must be wrapped in double quotes. Fix the file and upload it again.',
    )
  })

  it('passes any other failure through as it was', async () => {
    const { importErrorMessage } = await import('@/plugins/eventImport/finish')
    expect(importErrorMessage(new Error('The target region no longer exists.'))).toBe(
      'The target region no longer exists.',
    )
  })
})
