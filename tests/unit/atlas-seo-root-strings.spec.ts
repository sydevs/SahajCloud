import { describe, expect, it } from 'vitest'

import {
  resolveRootStrings,
  ROOT_TITLE_FALLBACK,
} from '@/endpoints/atlas/seo/rootStrings'

/**
 * The atlas landing page's fallback chain (#739) — the one decision
 * `rootStrings.ts` exists to make, extracted so it is testable without a
 * database.
 *
 * The asymmetry is the whole point: `<title>` is mandatory markup, so it falls
 * back to English and then to a constant. `<meta name="description">` is
 * optional, so it never falls back — the host writes that line in its own
 * language, which is the rule #646 set for regions.
 */
describe('resolveRootStrings', () => {
  const en = { root_title: 'Free Meditation Classes', root_description: 'Find a class near you.' }
  const fr = { root_title: 'Cours de méditation', root_description: 'Trouvez un cours.' }

  it('prefers the locale’s own copy over English', () => {
    expect(resolveRootStrings(fr, en)).toEqual({
      title: 'Cours de méditation',
      description: 'Trouvez un cours.',
    })
  })

  it('falls back to the English title, and to the constant when English is blank too', () => {
    expect(resolveRootStrings({}, en).title).toBe(en.root_title)
    expect(resolveRootStrings({}, {}).title).toBe(ROOT_TITLE_FALLBACK)
    // The read failed rather than the locale being blank — same answer, and no
    // second read was issued to get it.
    expect(resolveRootStrings(null, null).title).toBe(ROOT_TITLE_FALLBACK)
  })

  it('never borrows English’s description, whatever the title did', () => {
    expect(resolveRootStrings({}, en).description).toBeNull()
    expect(resolveRootStrings({ root_title: fr.root_title }, en).description).toBeNull()
  })

  // Blank and absent have to mean the same thing: a translator who cleared a
  // key has said "not in this language", not "send an empty string".
  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a non-string value', 42],
  ])('treats %s as no copy at all', (_label, value) => {
    const resolved = resolveRootStrings({ root_title: value, root_description: value }, en)
    expect(resolved.title).toBe(en.root_title)
    expect(resolved.description).toBeNull()
  })

  it('trims the copy it does use', () => {
    expect(resolveRootStrings({ root_title: '  Atlas  ', root_description: ' Hi. ' }, en)).toEqual({
      title: 'Atlas',
      description: 'Hi.',
    })
  })
})
