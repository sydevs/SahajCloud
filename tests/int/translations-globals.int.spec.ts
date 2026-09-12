/**
 * Integration tests for translations globals after the #414 refactor.
 *
 * Verifies:
 * - The tabs field is the first (and only) top-level field in each global.
 * - The tabs structure preserves Title-Case labels per global.
 * - Each leaf group emits one JSON field. richText keys live as siblings.
 * - Nested tabs (all three globals) are wrapped in a Payload group named after
 *   the tab slug so the API response is namespaced: `{ onboarding: { welcome:
 *   {…} } }` instead of `{ onboarding_welcome: {…} }`.
 * - Sy-atlas and wm-web both mix leaf tabs with nested ones. Sy-atlas's leaf
 *   tabs are Countries, Online, Calendar, Share, Compact, Seo and Emails;
 *   Common, Search, Filters, Event and Registration nest (#706). Since #707
 *   every wm-web tab carrying screen-reader-only copy declares `general` +
 *   `a11y` sub-groups, so its field names repeat across tabs and only the
 *   `<group>.<field>` PAIR identifies a leaf group.
 * - richText fields inside nested tabs keep the sub-slug prefix (the group
 *   wrapper supplies the tab namespace), so the field name is
 *   `welcome_legal_disclaimer` and the API path is
 *   `onboarding.welcome_legal_disclaimer`.
 * - Since #705 each sub-group renders as a collapsible rather than an inner
 *   tabs row, `localizeStatus` is on for the two web-project globals and off
 *   for `wm-app-translations`, the JSON columns enforce their own schema on
 *   write, and an API client reading a partly translated locale gets English
 *   for the blanks.
 */
import type { Field, JSONField, Payload, TabsField } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { composeTargetUrl } from '@/components/admin/PreviewTarget/composeTargetUrl'
import type { PreviewTarget } from '@/fields/previewTargetField'
import type { SchemaEntry } from '@/fields/translationsField'
import { PLURAL_CATEGORIES } from '@/lib/translations/pluralCategories'

import { createTestEnvironment } from '../utils/testHelpers'

const TRANSLATION_GLOBAL_SLUGS = [
  'wm-web-translations',
  'wm-app-translations',
  'sy-atlas-translations',
] as const

type Slug = (typeof TRANSLATION_GLOBAL_SLUGS)[number]

describe('Translations Globals Configuration', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  function findGlobal(slug: Slug) {
    const g = payload.globals.config.find((cfg) => cfg.slug === slug)
    if (!g) throw new Error(`Global ${slug} not found`)
    return g
  }

  function collectFieldsByPredicate(
    fields: ReadonlyArray<Field>,
    predicate: (f: Field) => boolean,
  ): Field[] {
    const out: Field[] = []
    for (const f of fields) {
      if (f.type === 'tabs') {
        for (const tab of f.tabs) out.push(...collectFieldsByPredicate(tab.fields, predicate))
      } else if (f.type === 'row' || f.type === 'collapsible') {
        out.push(...collectFieldsByPredicate(f.fields, predicate))
      } else if (f.type === 'group') {
        if (predicate(f)) {
          out.push(f)
        } else {
          out.push(...collectFieldsByPredicate(f.fields, predicate))
        }
      } else if (predicate(f)) {
        out.push(f)
      }
    }
    return out
  }

  /**
   * Every leaf group's JSON field, keyed by its API path: `<group>.<field>`
   * inside a nested tab, `<field>` in a flat one. That path is also the column
   * name with `_` for the dot, so it is the identity a leaf group has
   * everywhere it matters.
   */
  function jsonFields(slug: Slug): Array<{ field: JSONField; path: string }> {
    const tabsField = findGlobal(slug).fields[0] as TabsField
    const out: Array<{ field: JSONField; path: string }> = []
    for (const tab of tabsField.tabs) {
      for (const field of tab.fields) {
        // Payload's `group` is a union — an unnamed group has no `name`, and
        // the wrapper this builder emits is always named after its tab.
        if (field.type === 'group' && 'name' in field) {
          for (const child of collectFieldsByPredicate(field.fields, (f) => f.type === 'json')) {
            out.push({ field: child as JSONField, path: `${field.name}.${(child as JSONField).name}` })
          }
        } else if (field.type === 'json') {
          out.push({ field, path: field.name })
        }
      }
    }
    return out
  }

  const jsonFieldPaths = (slug: Slug) => jsonFields(slug).map((entry) => entry.path)

  function leafJsonField(slug: Slug, path: string): JSONField {
    const match = jsonFields(slug).find((entry) => entry.path === path)
    if (!match) throw new Error(`No JSON field ${path} on ${slug}`)
    return match.field
  }

  /** Every sub-group collapsible, across every nested tab. */
  function collapsibles(slug: Slug) {
    const tabsField = findGlobal(slug).fields[0] as TabsField
    return tabsField.tabs.flatMap((tab) =>
      tab.fields.flatMap((field) =>
        field.type === 'group' ? field.fields.filter((f) => f.type === 'collapsible') : [],
      ),
    ) as Array<{ admin?: { initCollapsed?: boolean }; label: unknown }>
  }

  it.each(TRANSLATION_GLOBAL_SLUGS)('%s has the tabs field as the only top-level field', (slug) => {
    const global = findGlobal(slug)
    expect(global.fields[0]?.type).toBe('tabs')
  })

  describe('Tab structure', () => {
    // The order is the reading order of the site, not an accident of the
    // schema file — a translator works down the page, not down a data model.
    it('wm-web-translations has the twelve #707 tabs, in order', () => {
      const tabsField = findGlobal('wm-web-translations').fields[0] as TabsField
      const labels = tabsField.tabs.map((t) => t.label)
      expect(labels).toEqual([
        'Common',
        'Navigation',
        'Footer',
        'Errors',
        'Article',
        'Meditation',
        'Lecture',
        'Map',
        'Forms',
        'Media',
        'Location',
        'Blocks',
      ])
    })

    // One tab per widget view since #706 — Region is gone (RegionView owns no
    // key of its own), and the seven views that had no CMS home now have one.
    // `Seo` and `Emails` are the two exceptions: no widget view reads either.
    // `Seo` holds the atlas landing page's own `<head>` copy (#739) — the one
    // group here a visitor never sees, read by crawlers and link previews.
    it('sy-atlas-translations has one tab per widget view, plus Seo and Emails', () => {
      const tabsField = findGlobal('sy-atlas-translations').fields[0] as TabsField
      const labels = tabsField.tabs.map((t) => t.label)
      expect(labels).toEqual([
        'Common',
        'Countries',
        'Search',
        'Filters',
        'Online',
        'Event',
        'Calendar',
        'Registration',
        'Share',
        'Compact',
        'Seo',
        'Emails',
      ])
    })
  })

  describe('Per-leaf-group JSON fields + richText siblings', () => {
    // `general` and `a11y` repeat across ten tabs, so a bare name proves
    // nothing. The pair is what maps to the `<tab>_<sub>` column, and asserting
    // the exact set is what catches a sub-group dropped from the schema.
    it('wm-web-translations emits one JSON field per leaf group, namespaced by tab', () => {
      expect(jsonFieldPaths('wm-web-translations')).toEqual([
        'common.general',
        'common.a11y',
        'navigation',
        'footer',
        'errors.general',
        'errors.a11y',
        'article.general',
        'article.a11y',
        'meditation.general',
        'meditation.a11y',
        'lecture.general',
        'lecture.a11y',
        'map.general',
        'map.a11y',
        'forms.general',
        'forms.a11y',
        'media.general',
        'media.a11y',
        'location.general',
        'location.a11y',
        'blocks.general',
        'blocks.a11y',
      ])
    })

    it('sy-atlas-translations emits a JSON field named after each leaf slug', () => {
      const tabsField = findGlobal('sy-atlas-translations').fields[0] as TabsField
      const fields = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'json'),
      ) as Array<{ name: string }>
      const names = fields.map((f) => f.name)
      // Leaf tabs emit a field named after the tab (`countries`, `share`).
      // Nested tabs emit one field per sub-group, so `chrome` legitimately
      // appears three times — once each under Common, Search and Filters.
      // Assert the full ordered set, so a dropped sub-group is caught rather
      // than absorbed by a name a sibling tab happens to share.
      expect(names).toEqual([
        'chrome',
        'settings',
        'errors',
        'report',
        'report_errors',
        'map',
        'feedback',
        'countries',
        'chrome',
        'results',
        'sort',
        'country_site',
        'nearby_prompt',
        'chrome',
        'format',
        'cadence',
        'days',
        'time',
        'language',
        'dates',
        'region',
        'online',
        'display',
        'actions',
        'recurrence',
        'title',
        'calendar',
        'form',
        'errors',
        'questions',
        'share',
        'compact',
        'seo',
        'emails',
      ])
    })

    it('wm-app-translations uses namespaced sub-group field names (no tab prefix, no `strings` sub-field)', () => {
      const tabsField = findGlobal('wm-app-translations').fields[0] as TabsField
      const fields = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'json'),
      ) as Array<{ name: string }>
      const names = fields.map((f) => f.name)
      expect(names).toContain('welcome')
      expect(names).toContain('name')
      expect(names).not.toContain('strings')
      expect(names).not.toContain('onboarding_welcome')
    })

    it('wm-app-translations names richText fields <subSlug>_<key> inside the onboarding group', () => {
      const tabsField = findGlobal('wm-app-translations').fields[0] as TabsField
      const richText = tabsField.tabs.flatMap((t) =>
        collectFieldsByPredicate(t.fields, (f) => f.type === 'richText'),
      ) as Array<{ name: string }>
      const names = richText.map((f) => f.name)
      // The group wrapper supplies the `onboarding` namespace, so the field name
      // keeps the sub-slug prefix but not the tab prefix.
      expect(names).toContain('welcome_legal_disclaimer')
      expect(names).not.toContain('legal_disclaimer')
      expect(names).not.toContain('onboarding_welcome_legal_disclaimer')
    })

    it('wm-web wraps each nested tab in one group of collapsibles, and leaves the flat two alone', () => {
      const tabsField = findGlobal('wm-web-translations').fields[0] as TabsField
      const flatTabs = new Set(['Navigation', 'Footer'])
      for (const tab of tabsField.tabs) {
        const label = String(tab.label)
        const groups = tab.fields.filter((f) => f.type === 'group') as Array<{
          type: 'group'
          fields: Field[]
        }>
        if (flatTabs.has(label)) {
          expect(groups, label).toHaveLength(0)
          continue
        }
        expect(groups, label).toHaveLength(1)
        expect(groups[0]!.fields.every((f) => f.type === 'collapsible'), label).toBe(true)
      }
    })

    // `a11y` is long, rarely edited, and would push the visible copy off the
    // screen. It is the one sub-group that starts closed.
    it('wm-web opens the General collapsible and closes Accessibility', () => {
      const groups = collapsibles('wm-web-translations')

      // Derived, not a hand-maintained 20: two sub-groups per nested tab, and
      // its only job is to prove the walk found something to assert on.
      const nestedTabs = jsonFieldPaths('wm-web-translations').filter((path) => path.includes('.'))
      expect(groups.length).toBe(nestedTabs.length)
      expect(groups.length).toBeGreaterThan(0)

      for (const group of groups) {
        const label = String(group.label)
        // "Accessibility", not the slug — `toWords('a11y')` gives "A11y",
        // which is a shorthand a translator should not have to decode. The
        // label and the collapse rule both come from SUBGROUP_PRESENTATION.
        expect(['General', 'Accessibility']).toContain(label)
        expect(group.admin?.initCollapsed, label).toBe(label === 'Accessibility')
      }
    })

    it('wm-app-translations wraps each nested-tab in a single group of collapsibles', () => {
      const tabsField = findGlobal('wm-app-translations').fields[0] as TabsField
      for (const tab of tabsField.tabs) {
        const groups = tab.fields.filter((f) => f.type === 'group') as Array<{
          type: 'group'
          name: string
          fields: Field[]
        }>
        // Each tab has either 0 groups (simple leaf tab) or exactly 1 group (nested sub-groups)
        expect(groups.length === 0 || groups.length === 1).toBe(true)
        if (groups.length === 1) {
          expect(groups[0]!.fields.every((f) => f.type === 'collapsible')).toBe(true)
        }
      }
    })

    it('sy-atlas-translations wraps every nested tab in a single group of collapsibles', () => {
      const tabsField = findGlobal('sy-atlas-translations').fields[0] as TabsField
      const nestedTabs = new Set(['Common', 'Search', 'Filters', 'Event', 'Registration'])
      for (const tab of tabsField.tabs) {
        const label = String(tab.label)
        const groups = tab.fields.filter((f) => f.type === 'group') as Array<{
          type: 'group'
          fields: Field[]
        }>
        if (nestedTabs.has(label)) {
          // Nested tabs wrap their sub-groups in exactly one group, whose
          // fields are one collapsible each (#705 — no inner tabs row).
          expect(groups, label).toHaveLength(1)
          expect(groups[0]!.fields.every((f) => f.type === 'collapsible'), label).toBe(true)
        } else {
          // Leaf tabs (Countries, Online, Calendar, Share, Compact, Emails)
          // have no group wrapper.
          expect(groups, label).toHaveLength(0)
        }
      }
    })
  })

  // A plural key is declared once and stored four times. The two sides read
  // different things off it — the admin renders the ONE declared key as a
  // grouped row, and the column stores the whole CLDR family — so a builder
  // that expanded in both places, or neither, would still look plausible.
  describe('plural keys expand for storage and stay collapsed for the admin', () => {
    it.each([
      ['map', 'general', 'classes_shown'],
      ['media', 'general', 'duration_minutes'],
    ])('%s.%s.%s', (groupName, fieldName, key) => {
      const field = leafJsonField('wm-web-translations', `${groupName}.${fieldName}`)

      const entries = (field.admin?.custom?.schemaEntries ?? []) as SchemaEntry[]
      const entry = entries.find((candidate) => candidate.key === key)
      expect(entry, `${key} in schemaEntries`).toBeDefined()
      expect(entry!.plural).toBe(true)
      // The admin gets the declared key, never the expanded ones — it renders
      // one row of per-category inputs from `plural`.
      expect(entries.map((candidate) => candidate.key)).not.toContain(`${key}_one`)

      const properties = (field.jsonSchema?.schema as { properties: Record<string, unknown> })
        .properties
      for (const category of PLURAL_CATEGORIES) {
        expect(Object.keys(properties), `${key}_${category}`).toContain(`${key}_${category}`)
      }
      expect(Object.keys(properties)).not.toContain(key)
    })

    // `strict` is what turns a budget into a save gate, and it has to survive
    // the plural expansion to reach every stored form.
    it('carries a strict limit onto every expanded form of duration_minutes', () => {
      const field = leafJsonField('wm-web-translations', 'media.general')
      const properties = (
        field.jsonSchema?.schema as {
          properties: Record<string, { maxLength?: number }>
        }
      ).properties
      for (const category of PLURAL_CATEGORIES) {
        expect(properties[`duration_minutes_${category}`]?.maxLength).toBe(18)
      }
      // An advisory limit stays out of the schema, so it never blocks a save.
      expect(properties.playlist).not.toHaveProperty('maxLength')
    })
  })

  // The root `experimental.localizeStatus` flag alone changes nothing: Payload
  // forces it off per entity unless the global also asks for it. #709 opted
  // `wm-app-translations` in, so all three now read `true` — and that is still
  // what catches a test config missing the root flag, because without it
  // Payload would sanitise all three back to `false` however they are written.
  describe('per-locale publish status', () => {
    it('is on for all three translations globals', () => {
      const localizeStatus = (slug: Slug) => {
        const versions = findGlobal(slug).versions as { drafts?: { localizeStatus?: boolean } }
        return versions.drafts?.localizeStatus === true
      }
      expect(localizeStatus('sy-atlas-translations')).toBe(true)
      expect(localizeStatus('wm-web-translations')).toBe(true)
      expect(localizeStatus('wm-app-translations')).toBe(true)
    })

    it('publishing one locale leaves the others unpublished', async () => {
      await payload.updateGlobal({
        slug: 'sy-atlas-translations',
        locale: 'fr',
        publishSpecificLocale: 'fr',
        data: { _status: 'published', countries: { title: 'Cours de méditation gratuits' } } as never,
        overrideAccess: true,
      })

      const all = (await payload.findGlobal({
        slug: 'sy-atlas-translations',
        locale: 'all',
        fallbackLocale: false,
        depth: 0,
        overrideAccess: true,
      })) as unknown as { _status: Record<string, string> }

      expect(all._status.fr).toBe('published')
      expect(all._status.de).not.toBe('published')
    })
  })

  // The JSON columns carry a `jsonSchema` and no `validate` of their own, so
  // Payload's built-in validator enforces the schema. These assertions exist
  // because a `validate` accidentally reintroduced anywhere would REPLACE that
  // validator, and every shape check would silently stop running.
  describe('the JSON columns enforce their schema on write', () => {
    const write = (data: Record<string, unknown>) =>
      payload.updateGlobal({
        slug: 'sy-atlas-translations',
        locale: 'en',
        data: data as never,
        overrideAccess: true,
      })

    it('rejects a key the schema does not declare', async () => {
      await expect(write({ compact: { mystery: 'nope' } })).rejects.toThrow()
    })

    it('rejects a non-string value for a declared key', async () => {
      await expect(write({ compact: { open: 42 } })).rejects.toThrow()
    })

    it('accepts a partial object, and null', async () => {
      await expect(write({ compact: { open: 'Find a class near you' } })).resolves.toBeDefined()
      await expect(write({ compact: null })).resolves.toBeDefined()
    })

    // #706 turned seven advisory budgets strict, so the limit is emitted into
    // the column's JSON Schema and Payload refuses the write itself.
    it('rejects a strict key over its maxLength', async () => {
      await expect(
        write({ event: { display: { chip_full: 'Completely full up' } } }),
      ).rejects.toThrow()
      await expect(write({ event: { display: { chip_full: 'Full' } } })).resolves.toBeDefined()
    })

    // Payload's built-in validator short-circuits on an "empty" value and
    // counts `[]` as empty, so the schema never sees it. The composed check
    // ahead of the delegation is what refuses it.
    it('rejects an array, which the built-in validator alone lets through', async () => {
      await expect(write({ compact: [] })).rejects.toThrow()
      await expect(write({ compact: ['a'] })).rejects.toThrow()
    })
  })
  /**
   * Live preview per tab (#708). The panel's URL is resolved on the server and
   * cannot see which tab is open, so each targeted tab carries a zero-height
   * `ui` field that repoints it on mount.
   */
  describe('live preview targets', () => {
    const TARGETED = ['sy-atlas-translations', 'wm-web-translations'] as const

    /** The global's own URL, resolved for one locale and nothing else. */
    const previewUrl = (slug: Slug, code = 'fr'): string => {
      const url = findGlobal(slug).admin?.livePreview?.url
      if (typeof url !== 'function') throw new Error(`${slug} resolves no live-preview URL`)
      // Deliberately called with no document: a URL that reached for `data`
      // would throw here, and mid-edit it would re-resolve and clobber the
      // repoint instead.
      return url({ locale: { code } } as never) as string
    }

    /** Every `preview` a global's schema declares, by the field that carries it. */
    const declaredTargets = (slug: Slug): [string, PreviewTarget][] => {
      const tabsField = findGlobal(slug).fields[0] as TabsField
      return tabsField.tabs.flatMap((tab) => {
        const first = tab.fields[0]
        if (!first || first.type !== 'ui') return []
        const custom = first.admin?.custom as { previewTarget?: PreviewTarget } | undefined
        return custom?.previewTarget ? [[first.name, custom.previewTarget] as const] : []
      })
    }

    it.each(TARGETED)('%s resolves its URL from the locale alone', (slug) => {
      expect(previewUrl(slug, 'fr')).not.toBe(previewUrl(slug, 'de'))
    })

    // A preview secret is read only on the route that also scrubs it from the
    // address bar at boot — SahajAtlasWeb's `/preview`, WeMeditateWeb's
    // `pages/preview/`. Neither of these URLs is one, and neither is any path
    // their tabs compose, so a secret here would sit in the panel's URL for a
    // whole editing session with nothing reading it.
    it.each(TARGETED)('%s carries no preview secret', (slug) => {
      const secret = process.env.SAHAJCLOUD_PREVIEW_SECRET
      // Guarded: an empty secret fails the containment check for every URL,
      // and an unset one passes it for any — it would search for "undefined".
      expect(secret).toBeTruthy()
      expect(new URL(previewUrl(slug)).searchParams.get('secret')).toBeNull()
      expect(previewUrl(slug)).not.toContain(secret!)
    })

    // This URL is what the eight untargeted tabs show, and what every targeted
    // tab restores to. A consumer's `/preview` boot route wants a `collection`
    // and an `id`: given neither, SahajAtlasWeb renders "Save this document to
    // preview it." over a click-swallowing `fixed inset-0`, and WeMeditateWeb
    // answers 403. So a global points at a view that renders with no document.
    it.each(TARGETED)('%s points at a view, not a document-less preview route', (slug) => {
      expect(new URL(previewUrl(slug)).pathname).not.toMatch(/(^|\/)preview\/?$/)
    })

    // A relative target resolves against this URL, so the trailing slash is
    // what keeps `map` under `/fr` instead of hoisting it to the site root.
    // Asserted through the composition, not just the shape, because the slash
    // is otherwise a character nobody would think to defend.
    it('wm-web-translations composes a relative target under the edited locale', () => {
      const base = previewUrl('wm-web-translations', 'fr')
      const map = declaredTargets('wm-web-translations').find(([, target]) => target.path === 'map')
      expect(map).toBeDefined()

      expect(new URL(composeTargetUrl(base, map![1])!).pathname).toBe('/fr/map')
    })

    it.each(TARGETED)('%s declares targets that compose onto its own origin', (slug) => {
      const base = previewUrl(slug)
      const targets = declaredTargets(slug)
      expect(targets.length).toBeGreaterThan(0)

      for (const [name, target] of targets) {
        const composed = composeTargetUrl(base, target)
        expect(composed, `${name} composed to nothing`).not.toBeNull()
        expect(new URL(composed!).origin).toBe(new URL(base).origin)
      }
    })

    // The base's query rides along verbatim, so a repoint never loses the
    // locale being edited. Asserted on the Atlas because that is where the
    // locale IS a query parameter — wm-web carries it in the path, checked
    // above. Dropping `secret` left `locale` the only parameter either sends,
    // so without this case nothing would notice the carry-forward going.
    it('sy-atlas-translations keeps the edited locale across a repoint', () => {
      const base = previewUrl('sy-atlas-translations', 'de')
      expect(new URL(base).searchParams.get('locale')).toBe('de')

      const targets = declaredTargets('sy-atlas-translations')
      expect(targets.length).toBeGreaterThan(0)

      for (const [name, target] of targets)
        expect(new URL(composeTargetUrl(base, target)!).searchParams.get('locale'), name).toBe('de')
    })

    // The mobile app has no web surface to preview, so it gains neither.
    it('wm-app-translations declares no live preview and no target', () => {
      expect(findGlobal('wm-app-translations').admin?.livePreview).toBeUndefined()
      expect(declaredTargets('wm-app-translations')).toHaveLength(0)
    })
  })
})
