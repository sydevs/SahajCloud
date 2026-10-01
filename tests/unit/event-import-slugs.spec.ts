import { describe, expect, it } from 'vitest'

import { assignSlugs, type SluggableNode } from '@/collections/EventImports/propose/slugs'

function node(name: string, parentName: string | null = null, key = name): SluggableNode {
  return { key, name, level: 'city', parentName }
}

describe('assignSlugs', () => {
  it('takes the plain slug when nothing holds it', () => {
    expect(assignSlugs([node('Pune')], []).get('Pune')).toBe('pune')
  })

  it('disambiguates on the parent before anything else', () => {
    const slugs = assignSlugs([node('Georgia', 'United States')], ['georgia'])

    expect(slugs.get('Georgia')).toBe('georgia-united-states')
  })

  it('falls through to a counter when the parent repeats the name', () => {
    // `berlin-berlin` disambiguates nothing a reader can use.
    const slugs = assignSlugs([node('Berlin', 'Berlin')], ['berlin'])

    expect(slugs.get('Berlin')).toBe('berlin-2')
  })

  it('falls through to a counter when the parent-qualified slug is taken too', () => {
    const slugs = assignSlugs([node('Georgia', 'United States')], [
      'georgia',
      'georgia-united-states',
    ])

    expect(slugs.get('Georgia')).toBe('georgia-2')
  })

  it('counts up past every taken suffix', () => {
    const slugs = assignSlugs([node('Pune', 'Maharashtra')], [
      'pune',
      'pune-maharashtra',
      'pune-2',
      'pune-3',
    ])

    expect(slugs.get('Pune')).toBe('pune-4')
  })

  it('reads the taken set case-insensitively', () => {
    // `Regions.slug` is lower-cased by `slugifyValue`, but the set handed in is
    // whatever a query returned.
    expect(assignSlugs([node('Pune')], ['PUNE']).get('Pune')).toBe('pune-2')
  })

  it('keeps two same-named nodes in one batch apart', () => {
    const slugs = assignSlugs(
      [node('Springfield', 'Illinois', 'a'), node('Springfield', 'Missouri', 'b')],
      [],
    )

    expect(slugs.get('a')).toBe('springfield')
    expect(slugs.get('b')).toBe('springfield-missouri')
  })

  it('gives the plain slug to whichever node is proposed first', () => {
    const slugs = assignSlugs(
      [node('Springfield', 'Missouri', 'b'), node('Springfield', 'Illinois', 'a')],
      [],
    )

    expect(slugs.get('b')).toBe('springfield')
    expect(slugs.get('a')).toBe('springfield-illinois')
  })

  it('transliterates rather than falling back, so a Cyrillic name reads', () => {
    expect(assignSlugs([node('Москва')], []).get('Москва')).toBe('moskva')
  })

  it('falls back to the level for a name that slugifies to nothing', () => {
    const slugs = assignSlugs([{ key: 'k', name: '…', level: 'venue', parentName: null }], [])

    expect(slugs.get('k')).toBe('venue')
  })

  it('ignores blank entries in the taken set', () => {
    expect(assignSlugs([node('Pune')], ['', '   ']).get('Pune')).toBe('pune')
  })
})
