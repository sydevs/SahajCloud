import { describe, expect, it } from 'vitest'

import {
  blockedHeadings,
  rebuildStored,
  resolveStored,
  toggleHeading,
  type DetectedHeading,
} from '@/components/admin/TableOfContentsField/headings'

/**
 * #1207: a heading used to be identified by its slug, so two headings whose text
 * slugifies alike were one entry — ticking one ticked both, and a stored entry
 * could not say which of the two it stood for.
 */

/** A document, written as `<level><text>`; the slug is the text, lowercased and hyphenated. */
function doc(...spec: string[]): DetectedHeading[] {
  return spec.map((entry, index) => {
    const text = entry.slice(1)
    return {
      slug: text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      text,
      level: Number(entry[0]),
      index,
    }
  })
}

/** The two headings this ticket is about: different text, one slug. */
const ALIKE = doc('2Begin', '2Begin!')

const texts = (headings: DetectedHeading[]) => headings.map((h) => h.text)
const indexes = (headings: DetectedHeading[]) => headings.map((h) => h.index)

describe('resolveStored', () => {
  it('places an entry on the heading its own index names', () => {
    expect([...resolveStored(ALIKE, [ALIKE[1]])]).toEqual([1])
    expect([...resolveStored(ALIKE, [ALIKE[0]])]).toEqual([0])
  })

  it('re-places an entry the document moved, by slug, in order', () => {
    // A heading inserted above shifts every index by one; slug order places them again.
    const shifted = doc('2Intro', '2Begin', '2Begin!')
    expect([...resolveStored(shifted, [ALIKE[0], ALIKE[1]])]).toEqual([1, 2])
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
  it('keeps one of two alike headings and re-emits it with its index', () => {
    const rebuilt = rebuildStored(ALIKE, [ALIKE[1]])
    expect(texts(rebuilt)).toEqual(['Begin!'])
    expect(indexes(rebuilt)).toEqual([1])
  })

  it('gives a stored list with no indexes one', () => {
    const legacy = [{ slug: 'begin', text: 'Begin', level: 2 }]
    expect(indexes(rebuildStored(ALIKE, legacy))).toEqual([0])
  })

  it('holds a selection still when a heading is inserted above it', () => {
    const shifted = doc('2Intro', '2Begin', '2Begin!')
    expect(texts(rebuildStored(shifted, [ALIKE[1]]))).toEqual(['Begin!'])
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
    const blocked = blockedHeadings(document, new Set([2]))
    expect([...blocked]).toEqual([1])
  })

  it('blocks nothing at the top level', () => {
    expect([...blockedHeadings(ALIKE, new Set())]).toEqual([])
  })
})

describe('toggleHeading', () => {
  it('disables one of two alike headings and leaves the other', () => {
    const left = toggleHeading(ALIKE, new Set([0, 1]), 1)
    expect(indexes(left)).toEqual([0])
  })

  it('enables one of two alike headings and leaves the other', () => {
    const next = toggleHeading(ALIKE, new Set([0]), 1)
    expect(indexes(next)).toEqual([0, 1])
  })

  it('carries only its own nested headings', () => {
    const document = doc('2Begin', '3Detail', '2Begin!', '3Detail')
    expect(indexes(toggleHeading(document, new Set([0, 1, 2, 3]), 2))).toEqual([0, 1])
    expect(indexes(toggleHeading(document, new Set([2, 3]), 0))).toEqual([0, 1, 2, 3])
  })
})
