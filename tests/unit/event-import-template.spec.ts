/**
 * The template is generated from `IMPORT_COLUMNS`, so a column rename cannot
 * ship a header the parser refuses. Nothing guaranteed the same of its **example
 * row**, and #907 broke it: requiring `date` for a weekly class left the example
 * with a blank one, so the template shipped a row its own schedule mapper
 * refused.
 */

import { Temporal } from '@js-temporal/polyfill'
import { describe, expect, it } from 'vitest'

import { parseImportCsv } from '@/collections/EventImports/csv/parse'
import { mapCsvSchedule, scheduleArgsFor } from '@/collections/EventImports/csv/schedule'
import { buildImportTemplate } from '@/collections/EventImports/csv/template'

const parsed = () => {
  const result = parseImportCsv(buildImportTemplate())
  if (!result.ok) throw new Error(`the template does not parse: ${result.error}`)
  return result.rows
}

describe('the import template parses as its own parser demands', () => {
  it('yields exactly the example row, past the header and the help row', () => {
    const rows = parsed()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.values.title).toBe('Tuesday Evening Meditation')
  })

  /**
   * The example row is reported rather than skipped, so a volunteer who leaves
   * it in is told to replace it. That one error is the only one it may carry:
   * any other means the template itself names a value the parser refuses.
   */
  it('carries no fault but being the example', () => {
    const [row] = parsed()
    expect(row!.errors).toHaveLength(1)
    expect(row!.errors?.[0]).toContain("this is the template's example row")
    expect(row!.warnings ?? []).toEqual([])
  })

  it('builds a schedule from the example row', () => {
    const [row] = parsed()
    const result = mapCsvSchedule(
      scheduleArgsFor(row!.values, 'Europe/Berlin', Temporal.PlainDate.from('2026-10-10')),
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
