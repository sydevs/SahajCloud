/**
 * The English a translations schema declares, and what a seed does with it.
 *
 * These two functions are what replaced a hand-written data migration per key
 * (#1218), so the rules they encode — English only, one column per leaf group,
 * never a plural family — are the whole contract between a `default` in
 * `translationsSchema.json` and the value a reader ends up with.
 *
 * The SQL half is not here: `reconcileEnglishDefaults` needs a database, and
 * `tests/int/translations-globals.int.spec.ts` is where it runs.
 *
 * Unit lane: pure JSON in, no Payload bootstrap.
 */

import { describe, expect, it } from 'vitest'

import {
  collectColumnDefaults,
  withEnglishDefaults,
  type DefaultsSchema,
} from '@/lib/translations/englishDefaults'

import wmWebSchema from '../../src/globals/WeMeditateWebTranslations/translationsSchema.json' with { type: 'json' }

const nested: DefaultsSchema = {
  properties: {
    blocks: {
      type: 'object',
      properties: {
        general: {
          type: 'object',
          properties: {
            sidetext: { type: 'string', default: 'Ancient Wisdom' },
            hours: { type: 'string' },
          },
        },
        a11y: {
          type: 'object',
          properties: { label: { type: 'string', default: 'Decorative' } },
        },
      },
    },
  },
}

const flat: DefaultsSchema = {
  properties: {
    navigation: {
      type: 'object',
      properties: {
        about: { type: 'string', default: 'About' },
        count: { type: 'string', plural: true, default: 'ignored' },
        intro: { type: 'richText', default: 'ignored' },
      },
    },
  },
}

describe('collectColumnDefaults', () => {
  it('names one column per leaf group, under its parent tab', () => {
    expect(collectColumnDefaults(nested)).toEqual([
      { column: 'blocks_general', values: { sidetext: 'Ancient Wisdom' } },
      { column: 'blocks_a11y', values: { label: 'Decorative' } },
    ])
  })

  it('names a flat tab by the tab itself', () => {
    expect(collectColumnDefaults(flat)).toEqual([
      { column: 'navigation', values: { about: 'About' } },
    ])
  })

  // A plural key stores a CLDR family, so one declared value names no storage
  // key. A richText key is its own column, not a member of the group's blob.
  it('takes no default from a plural or a richText key', () => {
    const [{ values }] = collectColumnDefaults(flat)
    expect(Object.keys(values)).toEqual(['about'])
  })

  it('finds nothing in a schema that declares nothing', () => {
    expect(collectColumnDefaults({ properties: { footer: { type: 'object' } } })).toEqual([])
  })

  // The declaration this mechanism was built for. It is the schema's to hold,
  // and `wm-web-translations-seed.spec.ts` holds the other half: the corpus
  // file does not carry it too.
  it('reads the wisdom sidetext off the shipped WeMeditate Web schema', () => {
    const columns = collectColumnDefaults(wmWebSchema as unknown as DefaultsSchema)
    expect(columns).toContainEqual({
      column: 'blocks_general',
      values: { wisdom_sidetext: 'Ancient Wisdom' },
    })
  })
})

describe('withEnglishDefaults', () => {
  it('adds a declared key the data omits', () => {
    const merged = withEnglishDefaults({ blocks: { general: { hours: 'Hours' } } }, nested)
    expect(merged.blocks).toEqual({
      general: { hours: 'Hours', sidetext: 'Ancient Wisdom' },
      a11y: { label: 'Decorative' },
    })
  })

  it('keeps a value the data already carries', () => {
    const merged = withEnglishDefaults({ blocks: { general: { sidetext: 'Old Wisdom' } } }, nested)
    expect((merged.blocks as Record<string, Record<string, string>>).general.sidetext).toBe(
      'Old Wisdom',
    )
  })

  // A seed run is the deliberate act the boot-time reconciliation is not, so
  // it is the one writer allowed to refill an emptied key.
  it('fills a blank value', () => {
    const merged = withEnglishDefaults({ blocks: { general: { sidetext: '   ' } } }, nested)
    expect((merged.blocks as Record<string, Record<string, string>>).general.sidetext).toBe(
      'Ancient Wisdom',
    )
  })

  it('leaves the caller’s document untouched', () => {
    const data = { blocks: { general: { hours: 'Hours' } } }
    withEnglishDefaults(data, nested)
    expect(data).toEqual({ blocks: { general: { hours: 'Hours' } } })
  })

  it('carries every other field through', () => {
    const merged = withEnglishDefaults({ footer: { copyright: '©' } }, flat)
    expect(merged.footer).toEqual({ copyright: '©' })
    expect(merged.navigation).toEqual({ about: 'About' })
  })
})
