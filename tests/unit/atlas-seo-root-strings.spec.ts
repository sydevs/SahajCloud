import { describe, expect, it } from 'vitest'

import {
  resolveRootStrings,
  ROOT_TITLE_FALLBACK,
  type RootCopy,
} from '@/endpoints/atlas/seo/rootStrings'

/**
 * The atlas landing page's fallback chain (#739) — the one decision
 * `rootStrings.ts` exists to make, extracted so it is testable without a
 * database.
 *
 * The asymmetry is the whole point: `<title>` is mandatory markup, so it falls
 * back — first within the locale, to the name the widget already uses there,
 * and only then to English and a constant. `<meta name="description">` is
 * optional, so it never falls back at all: the host writes that line in its own
 * language, which is the rule #646 set for regions.
 */
describe('resolveRootStrings', () => {
  // `common` is a group of collapsibles since #706, and the chain reads exactly
  // one of them, so the helper takes the `chrome` strings and nests them.
  const copy = (
    seo: Record<string, unknown> | null,
    chrome: Record<string, unknown> | null = null,
  ): RootCopy => ({
    common: chrome === null ? null : { chrome },
    seo,
  })

  const en = copy(
    { root_title: 'Free Meditation Classes', root_description: 'Find a class near you.' },
    { widget_label: 'Free Meditation Classes' },
  )
  const fr = copy(
    { root_title: 'Cours de méditation', root_description: 'Trouvez un cours.' },
    { widget_label: 'Cours de méditation gratuits' },
  )

  it('prefers the locale’s own copy over English', () => {
    expect(resolveRootStrings(fr, en)).toEqual({
      title: 'Cours de méditation',
      description: 'Trouvez un cours.',
    })
  })

  // The reviewer's call on #769: a locale nobody has written `seo.root_title`
  // for is named in its own language, not in ours. `common.chrome` is seeded in ten
  // locales where `seo` is empty everywhere, so this is the live path today.
  it('names the atlas in the locale’s own words before it looks at English', () => {
    const untitled = copy(null, { widget_label: 'Cours de méditation gratuits' })
    expect(resolveRootStrings(untitled, en).title).toBe('Cours de méditation gratuits')
  })

  it('falls back to English only when the locale names the atlas nowhere', () => {
    expect(resolveRootStrings(copy({}, {}), en).title).toBe('Free Meditation Classes')
    // English's own widget string answers when nobody wrote a landing title.
    expect(resolveRootStrings(copy(null), copy(null, { widget_label: 'Classes' })).title).toBe(
      'Classes',
    )
    expect(resolveRootStrings(copy({}, {}), copy({}, {})).title).toBe(ROOT_TITLE_FALLBACK)
    // The read failed rather than the locale being blank — same answer, and no
    // second read was issued to get it.
    expect(resolveRootStrings(null, null).title).toBe(ROOT_TITLE_FALLBACK)
  })

  it('never borrows English’s description, whatever the title did', () => {
    expect(resolveRootStrings(copy({}, {}), en).description).toBeNull()
    expect(resolveRootStrings(copy({ root_title: 'Cours' }), en).description).toBeNull()
    // Nor does the widget string leak into a description — it only names.
    expect(resolveRootStrings(copy(null, { widget_label: 'Cours' }), en).description).toBeNull()
  })

  // Blank and absent have to mean the same thing: a translator who cleared a
  // key has said "not in this language", not "send an empty string".
  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a non-string value', 42],
  ])('treats %s as no copy at all', (_label, value) => {
    const blank = copy(
      { root_title: value, root_description: value },
      { widget_label: value },
    )
    const resolved = resolveRootStrings(blank, en)
    expect(resolved.title).toBe('Free Meditation Classes')
    expect(resolved.description).toBeNull()
  })

  it('trims the copy it does use', () => {
    expect(resolveRootStrings(copy({ root_title: '  Atlas  ', root_description: ' Hi. ' }), en)).toEqual({
      title: 'Atlas',
      description: 'Hi.',
    })
    expect(resolveRootStrings(copy(null, { widget_label: '  Cours  ' }), en).title).toBe(
      'Cours',
    )
  })
})
