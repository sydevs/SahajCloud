/**
 * The region non-empty-slug invariant (#634).
 *
 * Unit-level because the interesting branch is unreachable from an integration
 * test: the grandfather clause only fires for a region that is *already* blank,
 * and the invariant itself refuses to create one.
 */
import type { TextField } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { withNonEmptySlug } from '@/collections/Regions/nonEmptySlug'

type Options = { operation?: string; previousValue?: unknown }

/** Invoke the wrapper the way Payload's field validation does. */
const run = (
  value: string | null | undefined,
  options: Options,
  inner?: TextField['validate'],
): string | true | Promise<string | true> =>
  (withNonEmptySlug(inner) as unknown as (v: unknown, o: Options) => string | true)(value, options)

describe('withNonEmptySlug', () => {
  describe('refuses a newly blank slug', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['null', null],
      ['undefined', undefined],
    ])('on create — %s', (_name, value) => {
      expect(run(value, { operation: 'create' })).toContain('needs a slug')
    })

    it('on an update that clears a slug which had a value', () => {
      expect(run('', { operation: 'update', previousValue: 'amsterdam' })).toContain('needs a slug')
    })
  })

  describe('grandfathers a slug that was already blank', () => {
    // The nested-docs `resaveChildren` cascade re-saves every descendant by
    // passing its whole existing document back through `update`. With 16 blank
    // regions in the data, rejecting this would make their ancestors unsaveable.
    it.each([
      ['empty previous value', ''],
      ['whitespace previous value', '  '],
      ['absent previous value', undefined],
    ])('on update — %s', (_name, previousValue) => {
      expect(run('', { operation: 'update', previousValue })).toBe(true)
    })
  })

  describe('delegates a non-blank slug to the wrapped validator', () => {
    it('passes the value and options straight through', () => {
      const inner = vi.fn().mockReturnValue(true)
      const options = { operation: 'update', previousValue: 'old' }
      expect(run('amsterdam', options, inner as unknown as TextField['validate'])).toBe(true)
      expect(inner).toHaveBeenCalledWith('amsterdam', options)
    })

    it('surfaces the wrapped validator’s rejection unchanged', () => {
      const inner = vi.fn().mockReturnValue('This slug is already in use.')
      expect(
        run('amsterdam', { operation: 'create' }, inner as unknown as TextField['validate']),
      ).toBe('This slug is already in use.')
    })

    it('never consults the wrapped validator for a blank value', () => {
      // The uniqueness validator runs a query; a blank slug is already decided.
      const inner = vi.fn().mockReturnValue(true)
      run('', { operation: 'create' }, inner as unknown as TextField['validate'])
      expect(inner).not.toHaveBeenCalled()
    })

    it('is a no-op wrapper when there is nothing to wrap', () => {
      expect(run('amsterdam', { operation: 'create' })).toBe(true)
    })
  })
})
