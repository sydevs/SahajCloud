import { describe, expect, it } from 'vitest'

import { formatCellValue, inferColumns } from '@/components/admin/RecordTable/format'

describe('formatCellValue', () => {
  describe('datetime', () => {
    it('renders an ISO string as a stable UTC label', () => {
      expect(formatCellValue('2026-06-11T14:30:00.000Z', 'datetime')).toBe('2026-06-11 14:30 UTC')
    })

    it('accepts a Date instance', () => {
      expect(formatCellValue(new Date('2026-01-02T09:05:00.000Z'), 'datetime')).toBe(
        '2026-01-02 09:05 UTC',
      )
    })

    it('returns empty string for nullish/empty values', () => {
      expect(formatCellValue(null, 'datetime')).toBe('')
      expect(formatCellValue(undefined, 'datetime')).toBe('')
      expect(formatCellValue('', 'datetime')).toBe('')
    })

    it('falls back to the raw value when unparseable', () => {
      expect(formatCellValue('not-a-date', 'datetime')).toBe('not-a-date')
    })
  })

  describe('name', () => {
    it('renders the name from an actor reference', () => {
      expect(formatCellValue({ id: 7, name: 'Jo Manager' }, 'name')).toBe('Jo Manager')
    })

    it('falls back to #id when the name is missing', () => {
      expect(formatCellValue({ id: 7 }, 'name')).toBe('#7')
    })

    it('passes through a plain string', () => {
      expect(formatCellValue('email-link', 'name')).toBe('email-link')
    })

    it('returns empty string for nullish values', () => {
      expect(formatCellValue(null, 'name')).toBe('')
    })
  })

  describe('text (default)', () => {
    it('stringifies scalars', () => {
      expect(formatCellValue('reminder')).toBe('reminder')
      expect(formatCellValue(3)).toBe('3')
    })

    it('JSON-encodes objects', () => {
      expect(formatCellValue({ a: 1 })).toBe('{"a":1}')
    })

    it('returns empty string for nullish values', () => {
      expect(formatCellValue(null)).toBe('')
      expect(formatCellValue(undefined)).toBe('')
    })
  })
})

describe('inferColumns', () => {
  it('collects the union of keys in first-seen order', () => {
    const columns = inferColumns([
      { kind: 'verification', at: '2026-01-01', method: 'import' },
      { kind: 'reminder', at: '2026-02-01', stage: 'reminded', channel: 'email' },
    ])
    expect(columns.map((c) => c.key)).toEqual(['kind', 'at', 'method', 'stage', 'channel'])
  })

  it('derives Title-Case labels from keys', () => {
    const columns = inferColumns([{ verificationStage: 'verified' }])
    expect(columns[0]).toEqual({ key: 'verificationStage', label: 'Verification Stage' })
  })

  it('skips non-object rows', () => {
    expect(inferColumns([null as never, 42 as never, { a: 1 }])).toEqual([{ key: 'a', label: 'A' }])
  })
})
