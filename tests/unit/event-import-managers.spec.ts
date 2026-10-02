import { describe, expect, it } from 'vitest'

import { managerKeyOf, managerRoster } from '@/collections/EventImports/commit/managers'

function row(line: number, managerEmail?: string, managerName?: string) {
  return {
    line,
    values: { ...(managerEmail && { managerEmail }), ...(managerName && { managerName }) },
  }
}

describe('managerRoster', () => {
  it('names each coordinator once, with the lines that asked for them', () => {
    const roster = managerRoster([
      row(2, 'anna@example.org', 'Anna Schmidt'),
      row(3, 'bo@example.org', 'Bo Lee'),
      row(4, 'anna@example.org', 'Anna Schmidt'),
    ])

    expect(roster).toEqual([
      { email: 'anna@example.org', name: 'Anna Schmidt', lines: [2, 4] },
      { email: 'bo@example.org', name: 'Bo Lee', lines: [3] },
    ])
  })

  /**
   * ⚠ **The assertion the unique index depends on.** Payload lowercases `email`
   * on an auth collection, so two spellings are one account — and a
   * case-sensitive roster finds neither on the second pass and tries to create a
   * duplicate the index then refuses, part-way through the commit.
   */
  it('treats two spellings of one address as one coordinator', () => {
    const roster = managerRoster([row(2, 'Anna@Example.org', 'Anna'), row(3, 'anna@example.org')])

    expect(roster).toEqual([{ email: 'anna@example.org', name: 'Anna', lines: [2, 3] }])
  })

  /**
   * ⚠ **`Managers.name` is required**, so a blank here loses the class that
   * named the coordinator rather than merely naming them awkwardly.
   */
  it('names an account after the address’s local part when no name is given', () => {
    expect(managerRoster([row(2, 'anna.schmidt@example.org')])[0]?.name).toBe('anna.schmidt')
  })

  it('keeps the first name given and does not refuse a later spelling', () => {
    const roster = managerRoster([
      row(2, 'anna@example.org', 'Anna'),
      row(3, 'anna@example.org', 'Ana'),
    ])

    expect(roster).toEqual([{ email: 'anna@example.org', name: 'Anna', lines: [2, 3] }])
  })

  it('keeps the local-part fallback even where a later row names them', () => {
    expect(managerRoster([row(2, 'anna@example.org'), row(3, 'anna@example.org', 'Anna')])).toEqual(
      [{ email: 'anna@example.org', name: 'anna', lines: [2, 3] }],
    )
  })

  it('leaves out a row that names no coordinator', () => {
    expect(managerRoster([row(2), row(3, '   '), row(4, 'anna@example.org', 'Anna')])).toEqual([
      { email: 'anna@example.org', name: 'Anna', lines: [4] },
    ])
  })
})

describe('managerKeyOf', () => {
  it('answers the roster’s own key for a row', () => {
    expect(managerKeyOf({ managerEmail: ' Anna@Example.org ' })).toBe('anna@example.org')
  })

  it('answers null for a row with no coordinator', () => {
    expect(managerKeyOf({})).toBeNull()
    expect(managerKeyOf({ managerEmail: '  ' })).toBeNull()
  })
})
