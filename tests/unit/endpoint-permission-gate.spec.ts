import { relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SRC, sourceFiles, sourceOf } from '../utils/importGraph'

/**
 * An endpoint evaluates a manager permission through `requireManagerPermission`
 * or `requireCollectionPermission` (`@/lib/endpoints`), never by calling
 * `hasPermission` itself.
 *
 * The rule is not about tidiness. The scope argument has to be
 * `roleScopeFromLocale(req.locale)`, and a check written out at the handler is
 * free to omit it — which resolves the **default** locale and silently 403s
 * every manager whose roles live elsewhere (#701, #665,
 * `docs/rules/access.md`). Two endpoints hand-rolled the pair, and they had
 * already diverged on `bypassPermissions` by the time #969 collapsed them.
 *
 * ⚠ **A docblock does not hold this.** The nested guide that loads in
 * `src/collections/` taught the locale-less call by example for months, so
 * prose was the enforcement and prose had drifted. This is what checks.
 *
 * Scoped to the two endpoint trees on purpose. `src/plugins/access/` owns the
 * function, and the admin UI's visibility helpers are a different question
 * answered by a different argument (`'union'`, with no request to take a locale
 * from).
 */
const GATED_TREES = ['collections', 'endpoints']

/** The call form, not the identifier — prose naming the helper is still fine. */
const HAND_ROLLED = /\b(hasPermission|hasAnyPermission|roleScopeFromLocale)\s*\(/

describe('an endpoint reaches a permission check through the shared gate', () => {
  it('has no hand-rolled check under src/collections or src/endpoints', () => {
    const offenders = GATED_TREES.flatMap((tree) =>
      sourceFiles(`${SRC}/${tree}`)
        .filter((file) => HAND_ROLLED.test(sourceOf(file)))
        .map((file) => relative(SRC, file)),
    )
    // Call the gate instead — it owns the locale scope and the 403 envelope.
    expect(offenders).toEqual([])
  })

  // Without this the case above passes by scanning nothing, which is how a
  // renamed tree would read as compliance. Named files rather than a count,
  // because the two the extraction repointed are the ones the scan must reach.
  it('scans the trees the rule is about', () => {
    const scanned = GATED_TREES.flatMap((tree) =>
      sourceFiles(`${SRC}/${tree}`).map((file) => relative(SRC, file)),
    )
    expect(scanned).toContain('collections/UserSubmissions/endpoints/review.ts')
    expect(scanned).toContain('collections/Frames/endpoints/byNarrator.ts')
    expect(scanned).toContain('endpoints/atlas/seo/index.ts')
  })

  // And the pattern has to match the shape it is written for, or the list above
  // is empty for the wrong reason.
  it('matches a hand-rolled call in either spelling', () => {
    expect(HAND_ROLLED.test('locale: roleScopeFromLocale(req.locale),')).toBe(true)
    expect(HAND_ROLLED.test('if (!hasPermission({ user: req.user }, bypassPermissions)) {')).toBe(
      true,
    )
    expect(HAND_ROLLED.test('gated on `frames` read permission')).toBe(false)
  })
})
