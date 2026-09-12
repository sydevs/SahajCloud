/**
 * Every preview target actually declared in a translations schema, checked
 * against the URL its own global resolves (#708).
 *
 * `composeTargetUrl` is pinned separately on synthetic inputs. This spec asks
 * the question that one cannot: do the declarations we ship compose into a URL
 * on the right origin, keeping the preview `secret` and the locale?
 *
 * Two failures it exists to catch, both silent:
 *
 * - **A path that carries an origin.** The declaration ships to the browser in
 *   `admin.custom`, so an absolute URL there would point the admin's own iframe
 *   somewhere else. `composeTargetUrl` refuses it, which turns the failure into
 *   a preview that simply never moves — invisible without this assertion.
 * - **A base URL that loses its locale prefix.** A relative target resolves
 *   against the global's URL, so `…/fr/` and `…/fr` compose differently, and
 *   the second silently previews the wrong language.
 */
import { describe, expect, it } from 'vitest'

import { composeTargetUrl } from '@/components/admin/PreviewTarget/composeTargetUrl'
import type { PreviewTarget } from '@/fields/previewTargetField'
import atlasSchema from '@/globals/SahajAtlasTranslations/translationsSchema.json' with { type: 'json' }
import webSchema from '@/globals/WeMeditateWebTranslations/translationsSchema.json' with { type: 'json' }

type Group = { preview?: PreviewTarget; type: string }
type Schema = { properties?: Record<string, Group> }

/**
 * The live-preview URL each global resolves, restated here rather than
 * imported: importing a global pulls the validated server env into the unit
 * lane. The shapes are asserted against the globals themselves in
 * `tests/int/translations-globals.int.spec.ts`.
 */
const BASES = {
  'sy-atlas-translations': 'https://atlas.example/preview?secret=s3cret&locale=fr',
  'wm-web-translations': 'https://web.example/fr/?secret=s3cret',
} as const

const targets = (schema: Schema): [string, PreviewTarget][] =>
  Object.entries(schema.properties ?? {})
    .filter(([, group]) => !!group.preview)
    .map(([slug, group]) => [slug, group.preview!])

const declared = {
  'sy-atlas-translations': targets(atlasSchema as unknown as Schema),
  'wm-web-translations': targets(webSchema as unknown as Schema),
}

describe('declared preview targets', () => {
  // A vacuous pass is the failure mode here: drop the declarations and every
  // `it.each` below would report success over an empty list.
  it('both schemas declare at least one target', () => {
    expect(declared['sy-atlas-translations'].length).toBeGreaterThan(0)
    expect(declared['wm-web-translations'].length).toBeGreaterThan(0)
  })

  describe.each(Object.entries(declared))('%s', (globalSlug, groups) => {
    const base = BASES[globalSlug as keyof typeof BASES]

    it.each(groups)('%s declares an origin-free path', (_slug, target) => {
      expect(target.path).toBeTruthy()
      expect(() => new URL(target.path!)).toThrow()
      expect(target.path).not.toMatch(/^[/\\\t\n\r]{2}|^\/[\\\t\n\r]/)
    })

    it.each(groups)('%s composes onto the preview origin, secret intact', (_slug, target) => {
      const composed = composeTargetUrl(base, target)
      expect(composed).not.toBeNull()

      const url = new URL(composed!)
      expect(url.origin).toBe(new URL(base).origin)
      expect(url.searchParams.get('secret')).toBe('s3cret')
    })
  })

  it('keeps the We Meditate locale prefix', () => {
    const map = declared['wm-web-translations'].find(([slug]) => slug === 'map')
    expect(map).toBeDefined()

    expect(composeTargetUrl(BASES['wm-web-translations'], map![1])).toBe(
      'https://web.example/fr/map?secret=s3cret',
    )
  })
})
