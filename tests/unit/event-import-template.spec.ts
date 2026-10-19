/**
 * The template is generated from `IMPORT_COLUMNS`, so a column rename cannot
 * ship a header the parser refuses. Nothing guaranteed the same of its **example
 * row**, and #907 broke it: requiring `date` for a weekly class left the example
 * with a blank one, so the template shipped a row its own schedule mapper
 * refused.
 */

import { readFileSync } from 'node:fs'

import { Temporal } from '@js-temporal/polyfill'
import { parse } from 'csv-parse/sync'
import { describe, expect, it } from 'vitest'

import { checkRowFields } from '@/plugins/eventImport/csv/fieldChecks'
import { mapCsvSchedule, scheduleArgsFor } from '@/plugins/eventImport/csv/schedule'
import { buildImportTemplate, isTemplateHelpRow } from '@/plugins/eventImport/csv/template'
import { normaliseRow } from '@/plugins/eventImport/rows'

/** Where the admin panel's own link points. */
const CHECKED_IN = 'public/event-import-template.csv'

/**
 * The plugin's own `parseCSV` options (`@payloadcms/plugin-import-export`,
 * `utilities/parseCSV.ts`), repeated here because the function is not
 * exported. `cast` is what hands `normaliseRow` a number for a bare postcode
 * and `undefined` for a blank cell, so the template is read exactly as an
 * upload of it would be.
 */
const parsed = (): Record<string, unknown>[] =>
  parse(buildImportTemplate(), {
    bom: true,
    cast: (value: string) => {
      if (value === '') return undefined
      if (value === 'true') return true
      if (value === 'false') return false
      if (value === 'null' || value === 'NULL') return null
      if (value.includes(',')) return value
      if (!Number.isNaN(Number(value))) {
        const num = Number(value)
        if (String(num) === value || value.includes('.')) return num
      }
      return value
    },
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

const exampleRow = () => {
  const [, example] = parsed()
  if (!example) throw new Error('the template has no example row')
  return normaliseRow(example)
}

describe('the import template parses as the plugin parses an upload', () => {
  it('yields the help row and the example row, and nothing else', () => {
    const records = parsed()
    expect(records).toHaveLength(2)
    expect(isTemplateHelpRow(Object.values(records[0]!).map(String))).toBe(true)
    expect(exampleRow().title).toBe('Tuesday Evening Meditation')
  })

  /**
   * The example row is reported rather than skipped, so a volunteer who leaves
   * it in is told to replace it. That one error is the only one it may carry:
   * any other means the template itself names a value the checks refuse.
   */
  it('carries no fault but being the example', () => {
    const { errors } = checkRowFields(exampleRow())
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("this is the template's example row")
  })

  it('builds a schedule from the example row', () => {
    const result = mapCsvSchedule(
      scheduleArgsFor(exampleRow(), 'Europe/Berlin', Temporal.PlainDate.from('2026-10-10')),
    )

    expect(result.ok).toBe(true)
    // 18:30 on Tuesday 2026-01-06 in Europe/Berlin (CET, UTC+1) is 17:30Z, so
    // the example's `date` and its `weekdays` agree — the pair the weekly arm
    // refuses when they do not.
    expect(result.ok && !result.inactive && result.schedule).toMatchObject({
      firstDate: '2026-01-06T17:30:00.000Z',
      recurrenceType: 'WEEKLY',
      weekdays: ['TU'],
    })
  })
})

/**
 * The volunteer downloads a static file, not a generated one: the Import tab's
 * description links `/event-import-template.csv`, which Next serves straight out
 * of `public/`. So nothing but this case stands between a renamed column and a
 * template the parser refuses — which is exactly the failure `columns.ts` was
 * made one constant to prevent.
 *
 * ⚠ **No endpoint and no build step, deliberately.** An endpoint would have to
 * be reachable anonymously (a volunteer downloads before anything is saved), and
 * a generated file in `public/` is one nobody can see go stale. A checked-in file
 * plus this case is the whole mechanism, and the failure message carries what to
 * paste.
 */
describe('the checked-in template matches the generated one', () => {
  it('has not drifted from IMPORT_COLUMNS', () => {
    const expected = buildImportTemplate()
    const actual = readFileSync(CHECKED_IN, 'utf-8')
    if (actual !== expected) {
      throw new Error(
        `${CHECKED_IN} is out of date. Replace its contents with exactly this:\n\n${expected}`,
      )
    }
  })
})
