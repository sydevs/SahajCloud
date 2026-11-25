import { describe, expect, it } from 'vitest'

import {
  blockedHeadings,
  rebuildStored,
  resolveStored,
  stampOccurrences,
  toggleHeading,
} from '@/components/admin/TableOfContentsField/headings'
import { slugifyAnchor } from '@/fields/slugify'
import type { TableOfContentsHeadings } from '@/payload-types'

/**
 * #1207: a heading used to be identified by its slug, so two headings whose text
 * slugifies alike were one entry — ticking one ticked both, and a stored entry
 * could not say which of the two it stood for.
 */

/** A document, written as `<level><text>`, slugged and counted the way the field does. */
function doc(...spec: string[]): TableOfContentsHeadings {
  return stampOccurrences(
    spec.map((entry) => {
      const text = entry.slice(1)
      return { slug: slugifyAnchor(text), text, level: Number(entry[0]) }
    }),
  )
}

/** The named positions of `document`, as the stored list holding them. */
const rows = (document: TableOfContentsHeadings, ...positions: number[]) =>
  positions.map((position) => document[position])

/** The two headings this ticket is about: different text, one slug. */
const ALIKE = doc('2Begin', '2Begin!')

describe('stampOccurrences', () => {
  it('counts within one slug, not across the document', () => {
    const document = doc('2Begin', '3Detail', '2Begin!', '3Detail')
    expect(document.map((heading) => heading.occurrence)).toEqual([0, 0, 1, 1])
  })
})

describe('resolveStored', () => {
  it('places an entry on the heading its own occurrence names', () => {
    expect([...resolveStored(ALIKE, [ALIKE[1]])]).toEqual([1])
    expect([...resolveStored(ALIKE, [ALIKE[0]])]).toEqual([0])
  })

  it('ignores a heading inserted above, which moves no occurrence', () => {
    const shifted = doc('2Intro', '2Begin', '2Begin!')
    expect([...resolveStored(shifted, [ALIKE[1]])]).toEqual([2])
    expect([...resolveStored(shifted, [ALIKE[0], ALIKE[1]])]).toEqual([1, 2])
  })

  it('tells two headings with identical text apart by occurrence', () => {
    const twins = doc('2Begin', '2Begin')
    expect([...resolveStored(twins, [twins[1]])]).toEqual([1])
  })

  it('places an entry stored before `occurrence` existed, by slug', () => {
    const legacy = [{ slug: 'begin', text: 'Begin', level: 2 }]
    expect([...resolveStored(ALIKE, legacy)]).toEqual([0])
  })

  it('gives two alike legacy entries one heading each, by text', () => {
    const legacy = [
      { slug: 'begin', text: 'Begin!', level: 2 },
      { slug: 'begin', text: 'Begin', level: 2 },
    ]
    expect([...resolveStored(ALIKE, legacy)]).toEqual([1, 0])
  })

  it('re-places an entry whose own occurrence was deleted', () => {
    expect([...resolveStored(doc('2Begin'), [ALIKE[1]])]).toEqual([0])
  })

  it('drops an entry whose heading is gone', () => {
    expect([...resolveStored(doc('2Other'), [ALIKE[0]])]).toEqual([])
  })
})

describe('rebuildStored', () => {
  it('re-emits a stored list carrying no occurrence with one', () => {
    const legacy = [{ slug: 'begin', text: 'Begin', level: 2 }]
    expect(rebuildStored(ALIKE, legacy)).toEqual(rows(ALIKE, 0))
  })

  it('drops a child whose own parent dropped out', () => {
    const document = doc('2Begin', '3Detail', '2Begin!', '3Detail')
    const stored = rows(document, 1, 2, 3)
    // `Detail` under the disabled first `Begin` goes; the one under the enabled
    // second `Begin` stays, though the two slugify alike.
    expect(rebuildStored(document, stored)).toEqual(rows(document, 2, 3))
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
    expect(toggleHeading(ALIKE, new Set([0, 1]), 1)).toEqual(rows(ALIKE, 0))
  })

  it('enables one of two alike headings and leaves the other', () => {
    expect(toggleHeading(ALIKE, new Set([0]), 1)).toEqual(rows(ALIKE, 0, 1))
  })

  it('carries only its own nested headings', () => {
    const document = doc('2Begin', '3Detail', '2Begin!', '3Detail')
    expect(toggleHeading(document, new Set([0, 1, 2, 3]), 2)).toEqual(rows(document, 0, 1))
    expect(toggleHeading(document, new Set([2, 3]), 0)).toEqual(rows(document, 0, 1, 2, 3))
  })

  it('drops an orphan the toggle did not touch', () => {
    const document = doc('2Begin', '3Detail', '2Begin!', '3Detail')
    // `Detail` at 1 is enabled while its own parent is not, which a stored list
    // written before this rule can hold. Emitting it would re-store the orphan.
    expect(toggleHeading(document, new Set([1]), 2)).toEqual(rows(document, 2, 3))
  })
})
