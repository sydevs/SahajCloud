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

  // ⚠ **`slugifyValue`'s charmap reads Cyrillic and little else.** CJK,
  // Hebrew, Devanagari and Thai slugged to nothing and took the level as their
  // slug, and Greek came out letter by letter with digits in it.
  it.each([
    ['東京', 'dongjing'],
    ['Αθήνα', 'athina'],
    ['תל אביב', 'tl-vyv'],
    ['पुणे', 'pune'],
    ['กรุงเทพ', 'krungethph'],
    ['München', 'munchen'],
  ])('transliterates %s to %s', (name, slug) => {
    expect(assignSlugs([node(name)], []).get(name)).toBe(slug)
  })

  it('qualifies a transliterated name on its transliterated parent', () => {
    expect(assignSlugs([node('府中', '東京')], ['fuzhong']).get('府中')).toBe('fuzhong-dongjing')
  })

  it('falls back to something distinctive for a name nothing transliterates', () => {
    const slugs = assignSlugs(
      [
        { key: 'a', name: '…', level: 'venue', parentName: null },
        { key: 'b', name: '·', level: 'venue', parentName: null },
      ],
      [],
    )

    expect(slugs.get('a')).toMatch(/^venue-[a-z0-9]+$/)
    expect(slugs.get('b')).toMatch(/^venue-[a-z0-9]+$/)
    expect(slugs.get('a')).not.toBe(slugs.get('b'))
    // Stable, so a re-slug after an edit does not move it.
    expect(assignSlugs([{ key: 'a', name: '…', level: 'venue', parentName: null }], []).get('a')).toBe(
      slugs.get('a'),
    )
  })

  it('ignores blank entries in the taken set', () => {
    expect(assignSlugs([node('Pune')], ['', '   ']).get('Pune')).toBe('pune')
  })
})
