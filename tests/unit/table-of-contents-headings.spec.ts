import { describe, expect, it } from 'vitest'

import {
  blockedHeadings,
  rebuildStored,
  resolveStored,
  toggleHeading,
} from '@/components/admin/TableOfContentsField/headings'
import { slugifyValue } from '@/fields/slugify'
import type { TableOfContentsHeadings } from '@/payload-types'

/**
 * #1207: a heading used to be identified by its slug, so two headings whose text
 * slugifies alike were one entry — ticking one ticked both, and a stored entry
 * could not say which of the two it stood for.
 */

/** A document, written as `<level><text>`, slugged the way the field slugs it. */
function doc(...spec: string[]): TableOfContentsHeadings {
  return spec.map((entry, index) => {
    const text = entry.slice(1)
    return { slug: slugifyValue(text), text, level: Number(entry[0]), index }
  })
}

/** The two headings this ticket is about: different text, one slug. */
const ALIKE = doc('2Begin', '2Begin!')

const indexes = (headings: TableOfContentsHeadings) => headings.map((h) => h.index)

describe('resolveStored', () => {
  it('places an entry on the heading its own index names', () => {
    expect([...resolveStored(ALIKE, [ALIKE[1]])]).toEqual([1])
    expect([...resolveStored(ALIKE, [ALIKE[0]])]).toEqual([0])
  })

  it('re-places an entry the document moved, by text', () => {
    // A heading inserted above shifts every index by one, so the index alone
    // would land this on `Begin`.
    const shifted = doc('2Intro', '2Begin', '2Begin!')
    expect([...resolveStored(shifted, [ALIKE[1]])]).toEqual([2])
    expect([...resolveStored(shifted, [ALIKE[0], ALIKE[1]])]).toEqual([1, 2])
  })

  it('tells two headings with identical text apart by position', () => {
    const twins = doc('2Begin', '2Begin')
    expect([...resolveStored(twins, [twins[1]])]).toEqual([1])
  })

  it('places an entry stored before `index` existed, by slug', () => {
    const legacy = [{ slug: 'begin', text: 'Begin', level: 2 }]
    expect([...resolveStored(ALIKE, legacy)]).toEqual([0])
  })

  it('gives two alike legacy entries one heading each', () => {
    const legacy = [
      { slug: 'begin', text: 'Begin', level: 2 },
      { slug: 'begin', text: 'Begin!', level: 2 },
    ]
    expect([...resolveStored(ALIKE, legacy)]).toEqual([0, 1])
  })

  it('drops an entry whose heading is gone', () => {
    expect([...resolveStored(doc('2Begin'), [ALIKE[1]])]).toEqual([0])
    expect([...resolveStored(doc('2Other'), [ALIKE[0]])]).toEqual([])
  })
})

describe('rebuildStored', () => {
  it('re-emits a stored list carrying no index with one', () => {
    const legacy = [{ slug: 'begin', text: 'Begin', level: 2 }]
    expect(rebuildStored(ALIKE, legacy)).toEqual([ALIKE[0]])
  })

  it('drops a child whose own parent dropped out', () => {
    const document = doc('2Begin', '3Detail', '2Begin!', '3Detail')
    const stored = [document[1], document[2], document[3]]
    // `Detail` under the disabled first `Begin` goes; the one under the enabled
    // second `Begin` stays, though the two slugify alike.
    expect(indexes(rebuildStored(document, stored))).toEqual([2, 3])
  })
})

describe('blockedHeadings', () => {
  it('blocks a child by its own parent, not by a heading that slugifies alike', () => {
    const document = doc('2Begin', '3Detail', '2Begin!', '3Detail')
    expect([...blockedHeadings(document, new Set([2]))]).toEqual([1])
  })

  it('blocks nothing at the top level', () => {
    expect([...blockedHeadings(ALIKE, new Set())]).toEqual([])
  })
})

describe('toggleHeading', () => {
  it('disables one of two alike headings and leaves the other', () => {
    expect(indexes(toggleHeading(ALIKE, new Set([0, 1]), 1))).toEqual([0])
  })

  it('enables one of two alike headings and leaves the other', () => {
    expect(indexes(toggleHeading(ALIKE, new Set([0]), 1))).toEqual([0, 1])
  })

  it('carries only its own nested headings', () => {
    const document = doc('2Begin', '3Detail', '2Begin!', '3Detail')
    expect(indexes(toggleHeading(document, new Set([0, 1, 2, 3]), 2))).toEqual([0, 1])
    expect(indexes(toggleHeading(document, new Set([2, 3]), 0))).toEqual([0, 1, 2, 3])
  })
})
