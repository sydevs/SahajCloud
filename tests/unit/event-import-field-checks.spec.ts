import { describe, expect, it } from 'vitest'

import type { RawImportRow } from '@/plugins/eventImport/csv/columns'
import { IMPORT_COLUMNS } from '@/plugins/eventImport/csv/columns'
import { checkRowFields } from '@/plugins/eventImport/csv/fieldChecks'

/**
 * The checks no `events` field can make, which run before the geocode. Every
 * Events rule — lengths, URLs, emails, select options — is Payload's own
 * validation, pinned in `tests/int/event-imports.int.spec.ts`.
 */

/** A complete `offline` row, so each case asserts its own column alone. */
const ROW = {
  title: 'Tuesday Meditation',
  eventType: 'offline',
  country: 'DE',
  city: 'Berlin',
  address: 'Main St 25',
}

const check = (values: RawImportRow) => checkRowFields({ ...ROW, ...values })

describe('checkRowFields — the row', () => {
  it('passes a complete row', () => {
    expect(check({})).toEqual([])
  })

  it('names each column this eventType owes', () => {
    expect(check({ address: '' })).toEqual(['address is required'])
    expect(check({ eventType: 'online' })).toEqual(['onlineUrl is required'])
  })

  it('reads eventType case-insensitively, and names the values it takes', () => {
    expect(check({ eventType: 'Offline' })).toEqual([])
    expect(check({ eventType: 'hybrid' })).toEqual([
      'eventType must be offline or online (got "hybrid")',
    ])
  })

  it("refuses the template's example row", () => {
    const example = Object.fromEntries(IMPORT_COLUMNS.map(({ name, example }) => [name, example]))
    expect(checkRowFields(example)).toEqual([
      `this is the template's example row — delete it, or replace it with one of your classes (got title "${example.title}")`,
    ])
  })
})

describe('checkRowFields — what a spreadsheet does to a cell', () => {
  it('names a phone Excel turned into scientific notation', () => {
    expect(check({ contactPhone: '4.93E+11' })).toEqual([
      'contactPhone was turned into scientific notation by the spreadsheet — format the column as text and type the number again (got "4.93E+11")',
    ])
  })

  it('refuses a formula, but not a phone number or a negative', () => {
    expect(check({ description: '=HYPERLINK("x")' })).toHaveLength(1)
    expect(check({ contactPhone: '+49 30 123456', description: '-1 is fine' })).toEqual([])
  })

  it('refuses a bidi override, spelling it out in the echo', () => {
    expect(check({ title: 'Evil‮class' })).toEqual([
      'title contains an invisible text-direction character that makes it display differently from what was typed — retype it (got "EvilU+202Eclass")',
    ])
  })
})

describe('checkRowFields — the columns no Events field checks', () => {
  it('refuses a managerEmail that is not one address', () => {
    expect(check({ managerEmail: 'anna@example.org' })).toEqual([])
    expect(check({ managerEmail: 'Anna <anna@example.org>' })).toEqual([
      'managerEmail must be one email address, like name@example.org (got "Anna <anna@example.org>")',
    ])
  })

  it('takes a registrationLimit of one place or more', () => {
    expect(check({ registrationLimit: '20' })).toEqual([])
    for (const value of ['0', '1.5', 'ten']) {
      expect(check({ registrationLimit: value })).toEqual([
        `registrationLimit must be a whole number of places, 1 or more — blank for unlimited (got "${value}")`,
      ])
    }
  })
})
