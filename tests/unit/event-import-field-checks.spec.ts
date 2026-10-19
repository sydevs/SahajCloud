import { describe, expect, it } from 'vitest'

import type { RawImportRow } from '@/plugins/eventImport/csv/columns'
import { IMPORT_COLUMNS } from '@/plugins/eventImport/csv/columns'
import { checkRowFields } from '@/plugins/eventImport/csv/fieldChecks'

/**
 * Unchecked here, every case would pass upload, resolve and review, and fail
 * only at commit — after the batch is locked and the volunteer can no longer
 * fix the file. The messages are asserted whole where the wording is ours, because
 * the echoed value is the half a volunteer navigates by.
 */

/**
 * A complete `offline` row, so each case below asserts its own column's checks
 * alone. `checkRowFields` also answers which columns this `eventType` owes, so a
 * base row missing one would add that refusal to all 26.
 */
const ROW = {
  title: 'Tuesday Meditation',
  eventType: 'offline',
  country: 'DE',
  city: 'Berlin',
  address: 'Main St 25',
  scheduleType: 'weekly',
}

function check(values: RawImportRow) {
  const row: RawImportRow = { ...ROW, ...values }
  return { ...checkRowFields(row), values: row }
}

describe('checkRowFields — URLs', () => {
  it.each([
    ['website', 'www.example.org'],
    ['onlineUrl', 'zoom.us/j/123'],
  ])('publishes a bare %s host over https, and says so', (column, value) => {
    const result = check({ [column]: value })
    expect(result.errors).toEqual([])
    expect(result.values[column]).toBe(`https://${value}`)
    expect(result.warnings).toEqual([
      `${column} had no https:// — it will be published as "https://${value}" (got "${value}")`,
    ])
  })

  it('refuses what is not a host, with the URL field’s own message', () => {
    expect(check({ website: 'see our page' }).errors).toEqual([
      'website: Please enter a valid URL (got "see our page")',
    ])
  })

  it('refuses a scheme the URL field does not allow', () => {
    expect(check({ onlineUrl: 'ftp://example.org/x' }).errors).toEqual([
      'onlineUrl: URL must start with http:// or https:// (got "ftp://example.org/x")',
    ])
  })

  it('leaves a full https URL alone', () => {
    expect(check({ website: 'https://example.org/a?b=c' })).toMatchObject({
      errors: [],
      warnings: [],
    })
  })
})

describe('checkRowFields — emails', () => {
  it.each(['contactEmail', 'managerEmail'])('names a copied mailto: link in %s', (column) => {
    expect(check({ [column]: 'mailto:a@example.org' }).errors).toEqual([
      `${column} must be the address alone, without "mailto:" (got "mailto:a@example.org")`,
    ])
  })

  it('names a display name around the address', () => {
    expect(check({ contactEmail: 'Anna <a@example.org>' }).errors).toEqual([
      'contactEmail must be the address alone, without a name or <> (got "Anna <a@example.org>")',
    ])
  })

  it('names two addresses in one cell', () => {
    expect(check({ managerEmail: 'a@example.org; b@example.org' }).errors).toEqual([
      'managerEmail must hold one address — put any other in a column of its own (got "a@example.org; b@example.org")',
    ])
  })

  it('refuses a malformed managerEmail, which would become a manager account', () => {
    expect(check({ managerEmail: 'anna@@example.org' }).errors).toEqual([
      'managerEmail must be one email address, like name@example.org (got "anna@@example.org")',
    ])
  })

  it('runs the contactEmail field’s own validator', () => {
    expect(check({ contactEmail: 'anna@example' }).errors).toEqual([
      'contactEmail: must be one email address, like name@example.org (got "anna@example")',
    ])
  })
})

describe('checkRowFields — lengths and titles, read off the Events fields', () => {
  it('refuses a title over the field’s 100 characters', () => {
    const [error] = check({ title: 'x'.repeat(101) }).errors
    expect(error).toMatch(/^title: must be 100 characters or fewer \(got "x{57}…"\)$/)
  })

  it('refuses a title holding a link, with the title field’s own message', () => {
    expect(check({ title: 'Meditation www.example.org' }).errors).toEqual([
      'title: Remove the link — a title isn’t clickable. Put it in Website or Online URL instead. (got "Meditation www.example.org")',
    ])
  })

  it.each(['venueName', 'room', 'contactName', 'contactPhone'])(
    'refuses %s over its field’s maxLength',
    (column) => {
      expect(check({ [column]: '1'.repeat(101) }).errors[0]).toMatch(
        new RegExp(`^${column}: must be 100 characters or fewer`),
      )
    },
  )
})

describe('checkRowFields — an inactive class owes a contact route', () => {
  it('refuses inactive with neither phone nor email, in the phone field’s words', () => {
    expect(check({ scheduleType: 'inactive' }).errors).toEqual([
      'contactPhone or contactEmail: Add a phone number or an email address — an inactive event has no schedule, so this is the only way a seeker can reach you. (got scheduleType "inactive" with both blank)',
    ])
  })

  it.each<RawImportRow>([{ contactPhone: '+49 30 123456' }, { contactEmail: 'a@example.org' }])(
    'accepts inactive with %o',
    (contact) => {
      expect(check({ scheduleType: 'Inactive', ...contact }).errors).toEqual([])
    },
  )
})

describe('checkRowFields — registrationLimit', () => {
  it.each(['12 people', '0x10', '1e3', '-0', '1.5'])('refuses %s', (value) => {
    expect(check({ registrationLimit: value }).errors).toEqual([
      `registrationLimit must be a whole number of places, digits only (got "${value}")`,
    ])
  })

  it('refuses 0, and says blank is unlimited', () => {
    expect(check({ registrationLimit: '0' }).errors).toEqual([
      'registrationLimit of 0 would refuse every registration — leave it blank for unlimited (got "0")',
    ])
  })

  it('accepts a plain count', () => {
    expect(check({ registrationLimit: '25' }).errors).toEqual([])
  })
})

describe('checkRowFields — what a spreadsheet does to a value', () => {
  it('names a phone Excel turned into scientific notation', () => {
    expect(check({ contactPhone: '4.91701E+12' }).errors).toEqual([
      'contactPhone looks like a number the spreadsheet turned into scientific notation — format the column as text and type the number again (got "4.91701E+12")',
    ])
  })

  it.each(['=HYPERLINK("http://x","y")', '@SUM(A1)', '+SUM(A1:A2)', '-A1+B2'])(
    'refuses the formula %s',
    (value) => {
      expect(check({ contactName: value }).errors[0]).toBe(
        `contactName starts like a spreadsheet formula — remove the leading "${value[0]}" (got "${value}")`,
      )
    },
  )

  it.each(['+49 30 123456', '-1', '- bring a mat'])('keeps %s, which only looks signed', (value) => {
    expect(check({ contactPhone: value }).errors).toEqual([])
  })

  it('refuses a bidi override, spelling it out in the echo', () => {
    expect(check({ contactName: 'Anna\u202Egnp.exe' }).errors).toEqual([
      'contactName contains an invisible text-direction character that makes it display differently from what was typed — retype it (got "AnnaU+202Egnp.exe")',
    ])
  })

  /**
   * A mark opens no range, so it reorders the rest of the cell on its own and
   * nothing in the value closes it — which is what makes one easy to leave out
   * of the class and believe it complete. Neither `parse.ts` nor this check
   * strips `\p{Cf}` from a value, so a mark it does not refuse is published as
   * typed.
   */
  it.each(['\u200E', '\u200F', '\u061C'])('refuses the bare mark %j', (mark) => {
    const spelled = `U+${mark.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
    expect(check({ contactName: `Anna${mark}Smith` }).errors).toEqual([
      `contactName contains an invisible text-direction character that makes it display differently from what was typed — retype it (got "Anna${spelled}Smith")`,
    ])
  })

  /** Persian and the Indic locales spell words with these. */
  it.each(['\u200C', '\u200D'])('keeps the joiner %j, which is a letter', (joiner) => {
    expect(check({ contactName: `Anna${joiner}Smith` }).errors).toEqual([])
  })
})

describe('checkRowFields — the schema is built from the column spec', () => {
  /**
   * The spreadsheet checks used to be a loop over whatever `values` held, so
   * they covered a column nobody had declared and missed nothing. The schema
   * covers what `IMPORT_COLUMNS` declares instead, which is only equivalent
   * while every column has an entry — so pin that, in both directions.
   */
  it.each(IMPORT_COLUMNS.map(({ name }) => name))('refuses a formula in %s', (column) => {
    const typed = '=SUM(A1)'
    // `eventType` is lowercased before any check reads it, so its message
    // echoes the value the check saw rather than the one that was typed.
    const echoed = column === 'eventType' ? typed.toLowerCase() : typed
    expect(check({ [column]: typed }).errors).toContain(
      `${column} starts like a spreadsheet formula — remove the leading "=" (got "${echoed}")`,
    )
  })

  it('leaves a column the template does not declare to the parser', () => {
    expect(check({ nickname: '=SUM(A1)' }).errors).toEqual([])
  })
})
