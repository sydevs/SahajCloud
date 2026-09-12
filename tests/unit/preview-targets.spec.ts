/**
 * The preview paths the two translations schemas actually declare (#708).
 *
 * One claim, which no other spec makes: **a declared path carries no origin.**
 * The declaration reaches the browser through `admin.custom`, so a path that
 * parsed as an absolute URL would be an attempt to point the admin's own
 * iframe elsewhere. `composeTargetUrl` refuses one, which turns the mistake
 * into a preview that silently never moves — cheap to catch here, invisible
 * otherwise.
 *
 * That the declarations compose correctly against each global's real URL is
 * asserted in `tests/int/translations-globals.int.spec.ts`, which can read the
 * URL rather than restate it.
 */
import { describe, expect, it } from 'vitest'

import type { PreviewTarget } from '@/fields/previewTargetField'
import atlasSchema from '@/globals/SahajAtlasTranslations/translationsSchema.json' with { type: 'json' }
import webSchema from '@/globals/WeMeditateWebTranslations/translationsSchema.json' with { type: 'json' }

type Group = { preview?: PreviewTarget; type: string }
type Schema = { properties?: Record<string, Group> }

const targets = (schema: Schema): [string, PreviewTarget][] =>
  Object.entries(schema.properties ?? {})
    .filter(([, group]) => !!group.preview)
    .map(([slug, group]) => [slug, group.preview!])

const declared = [
  ...targets(atlasSchema as unknown as Schema).map(
    ([slug, target]) => [`sy-atlas-translations ${slug}`, target] as const,
  ),
  ...targets(webSchema as unknown as Schema).map(
    ([slug, target]) => [`wm-web-translations ${slug}`, target] as const,
  ),
]

describe('declared preview targets', () => {
  // Without this, deleting every declaration would leave the case below
  // passing over an empty list.
  it('both schemas declare at least one target', () => {
    expect(targets(atlasSchema as unknown as Schema).length).toBeGreaterThan(0)
    expect(targets(webSchema as unknown as Schema).length).toBeGreaterThan(0)
  })

  it.each(declared)('%s declares an origin-free path', (_label, target) => {
    expect(target.path).toBeTruthy()
    // Not an absolute URL, and not one of the forms a browser resolves to
    // another origin: `//host`, a leading backslash, or a stripped control
    // character before the second slash.
    expect(() => new URL(target.path!)).toThrow()
    expect(target.path).not.toMatch(/^[/\\\t\n\r]{2}|^\/[\\\t\n\r]/)
  })
})
