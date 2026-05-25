/**
 * Unit tests for the segments → Lexical converter used by the
 * `wm-app-translations` seed importer.
 *
 * These tests run in the unit lane (no Payload bootstrap) because the
 * converter is a pure function. The Lexical shape it emits is asserted
 * exactly so that any drift from the project's known-working Lexical
 * conventions (matched against `seeds/lib/lexicalConverter.ts`) is caught.
 *
 * In particular:
 *   - All container nodes use `direction: null` (NOT `'ltr'`) — this matches
 *     the EditorJS-converted documents Payload already persists.
 *   - Link nodes use `version: 3` with `fields: { linkType: 'custom', url, newTab: false }`.
 *   - Text-node `format` is a bitmask: bit 0 = bold (1), bit 1 = italic (2).
 */

import { describe, expect, it } from 'vitest'

import {
  collectSeedTodos,
  isSeedRichTextField,
  seedLeafToPayloadData,
  seedRichTextToLexical,
  type SeedFile,
  type SeedRichTextField,
} from '../../seeds/wm-app-translations/lexicalConverter'

describe('seeds/wm-app-translations/lexicalConverter', () => {
  describe('isSeedRichTextField', () => {
    it('recognises objects with the _richText marker', () => {
      expect(isSeedRichTextField({ _richText: true, paragraphs: [] })).toBe(true)
    })

    it('rejects plain strings and other shapes', () => {
      expect(isSeedRichTextField('plain string')).toBe(false)
      expect(isSeedRichTextField(null)).toBe(false)
      expect(isSeedRichTextField(undefined)).toBe(false)
      expect(isSeedRichTextField({})).toBe(false)
      expect(isSeedRichTextField({ paragraphs: [] })).toBe(false)
      expect(isSeedRichTextField({ _richText: false, paragraphs: [] })).toBe(false)
    })
  })

  describe('seedRichTextToLexical', () => {
    it('emits a root with direction:null and a single paragraph for plain text', () => {
      const field: SeedRichTextField = {
        _richText: true,
        paragraphs: [[{ text: 'Hello, friend.' }]],
      }
      const out = seedRichTextToLexical(field, 'test.greeting')
      expect(out).toEqual({
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            {
              type: 'paragraph',
              version: 1,
              format: '',
              indent: 0,
              direction: null,
              textFormat: 0,
              children: [
                {
                  type: 'text',
                  version: 1,
                  format: 0,
                  text: 'Hello, friend.',
                  detail: 0,
                  mode: 'normal',
                  style: '',
                },
              ],
            },
          ],
        },
      })
    })

    it('sets format=1 for bold text', () => {
      const out = seedRichTextToLexical(
        { _richText: true, paragraphs: [[{ text: 'shout', bold: true }]] },
        'test.bold',
      )
      const child = out.root.children[0].children[0]
      expect(child.type).toBe('text')
      if (child.type === 'text') expect(child.format).toBe(1)
    })

    it('sets format=2 for italic text', () => {
      const out = seedRichTextToLexical(
        { _richText: true, paragraphs: [[{ text: 'emphasis', italic: true }]] },
        'test.italic',
      )
      const child = out.root.children[0].children[0]
      expect(child.type).toBe('text')
      if (child.type === 'text') expect(child.format).toBe(2)
    })

    it('sets format=3 (bitmask) for bold+italic text', () => {
      const out = seedRichTextToLexical(
        {
          _richText: true,
          paragraphs: [[{ text: 'really shout', bold: true, italic: true }]],
        },
        'test.bold-italic',
      )
      const child = out.root.children[0].children[0]
      expect(child.type).toBe('text')
      if (child.type === 'text') expect(child.format).toBe(3)
    })

    it('emits a link node with version:3, linkType:custom, newTab:false, direction:null', () => {
      const out = seedRichTextToLexical(
        {
          _richText: true,
          paragraphs: [
            [
              { text: 'See ' },
              { type: 'link', text: 'what we share', href: 'wm-app-config://privacyPolicyPage#what-we-share' },
              { text: ' for details.' },
            ],
          ],
        },
        'test.link',
      )
      const children = out.root.children[0].children
      expect(children).toHaveLength(3)
      expect(children[0]).toMatchObject({ type: 'text', text: 'See ' })
      expect(children[1]).toEqual({
        type: 'link',
        version: 3,
        format: '',
        indent: 0,
        direction: null,
        fields: {
          linkType: 'custom',
          url: 'wm-app-config://privacyPolicyPage#what-we-share',
          newTab: false,
        },
        children: [
          {
            type: 'text',
            version: 1,
            format: 0,
            text: 'what we share',
            detail: 0,
            mode: 'normal',
            style: '',
          },
        ],
      })
      expect(children[2]).toMatchObject({ type: 'text', text: ' for details.' })
    })

    it('handles a link segment with bold formatting on the link text', () => {
      const out = seedRichTextToLexical(
        {
          _richText: true,
          paragraphs: [
            [
              { type: 'link', text: 'Terms', href: 'wm-app-config://termsAndConditionsPage', bold: true },
            ],
          ],
        },
        'test.bold-link',
      )
      const link = out.root.children[0].children[0]
      expect(link.type).toBe('link')
      if (link.type === 'link') {
        expect(link.children[0].format).toBe(1)
      }
    })

    it('emits multiple paragraphs in order', () => {
      const out = seedRichTextToLexical(
        {
          _richText: true,
          paragraphs: [[{ text: 'First.' }], [{ text: 'Second.' }], [{ text: 'Third.' }]],
        },
        'test.multi',
      )
      expect(out.root.children).toHaveLength(3)
      expect(out.root.children[0].children[0]).toMatchObject({ text: 'First.' })
      expect(out.root.children[1].children[0]).toMatchObject({ text: 'Second.' })
      expect(out.root.children[2].children[0]).toMatchObject({ text: 'Third.' })
    })

    it('reproduces the consent_modal.body_intro shape end-to-end', () => {
      // This mirrors the exact shape used in data.en.json for the
      // post-first-meditation consent modal — sentence containing an
      // inline "what we share" link to the privacy detail.
      const out = seedRichTextToLexical(
        {
          _richText: true,
          paragraphs: [
            [
              {
                text:
                  "With your permission, we'll share a few basic app usage and device details with Meta, Apple Search Ads and Google Ads, like app installs or completed sessions. (",
              },
              {
                type: 'link',
                text: 'what we share',
                href: 'wm-app-config://privacyPolicyPage#what-we-share',
              },
              { text: ').' },
            ],
          ],
        },
        'onboarding_consent_modal.body_intro',
      )
      expect(out.root.children).toHaveLength(1)
      expect(out.root.children[0].children).toHaveLength(3)
      const link = out.root.children[0].children[1]
      expect(link.type).toBe('link')
      if (link.type === 'link') {
        expect(link.fields.url).toBe('wm-app-config://privacyPolicyPage#what-we-share')
      }
    })

    it('throws on link segment missing href', () => {
      expect(() =>
        seedRichTextToLexical(
          {
            _richText: true,
            paragraphs: [[{ type: 'link', text: 'oops' } as never]],
          },
          'test.bad-link',
        ),
      ).toThrow(/missing href/)
    })

    it('throws on link segment missing text', () => {
      expect(() =>
        seedRichTextToLexical(
          {
            _richText: true,
            paragraphs: [[{ type: 'link', href: 'wm-app-config://termsAndConditionsPage' } as never]],
          },
          'test.bad-link',
        ),
      ).toThrow(/missing text/)
    })

    it('throws on text segment without text field', () => {
      expect(() =>
        seedRichTextToLexical(
          { _richText: true, paragraphs: [[{ bold: true } as never]] },
          'test.bad-text',
        ),
      ).toThrow(/missing text/)
    })

    it('throws on empty paragraphs array', () => {
      expect(() =>
        seedRichTextToLexical({ _richText: true, paragraphs: [] }, 'test.empty'),
      ).toThrow(/non-empty paragraphs/)
    })

    it('throws on an empty paragraph (zero segments)', () => {
      expect(() =>
        seedRichTextToLexical(
          { _richText: true, paragraphs: [[]] },
          'test.empty-para',
        ),
      ).toThrow(/non-empty array of segments/)
    })

    it('error messages include the leaf path and paragraph index', () => {
      expect(() =>
        seedRichTextToLexical(
          {
            _richText: true,
            paragraphs: [
              [{ text: 'OK' }],
              [{ type: 'link', text: 'broken' } as never],
            ],
          },
          'onboarding_welcome.legal_disclaimer',
        ),
      ).toThrow(/onboarding_welcome\.legal_disclaimer\[¶1\]\[0\]/)
    })
  })

  describe('seedLeafToPayloadData', () => {
    it('passes pure-string leaves through (stripping _meta keys)', () => {
      const out = seedLeafToPayloadData('onboarding_name', {
        title: "What's your name?",
        placeholder: 'Your first name',
        continue: 'Continue',
        _source: 'documentation only — should be dropped',
      } as never)
      expect(out).toEqual({
        title: "What's your name?",
        placeholder: 'Your first name',
        continue: 'Continue',
      })
    })

    it('throws when a pure-string leaf has a non-string value', () => {
      expect(() =>
        seedLeafToPayloadData('bad_leaf', { good: 'ok', bad: 123 as unknown as string }),
      ).toThrow(/has non-string value/)
    })

    it('shapes a mixed leaf as { strings, ...richKeys }', () => {
      const out = seedLeafToPayloadData('onboarding_welcome', {
        strings: { title: 'Welcome, friend', get_started: 'Get started' },
        legal_disclaimer: {
          _richText: true,
          paragraphs: [
            [
              { text: 'By continuing, you agree to our ' },
              { type: 'link', text: 'Terms', href: 'wm-app-config://termsAndConditionsPage' },
            ],
          ],
        },
      } as never)
      expect((out as { strings: Record<string, string> }).strings).toEqual({
        title: 'Welcome, friend',
        get_started: 'Get started',
      })
      const richField = (out as Record<string, unknown>).legal_disclaimer as {
        root: { children: unknown[] }
      }
      expect(richField.root.children).toHaveLength(1)
    })

    it('drops _source / _todo / other _-prefixed metadata at all levels', () => {
      const out = seedLeafToPayloadData('mixed_leaf', {
        _source: 'documentation',
        _todo: 'TODO marker',
        strings: { foo: 'bar' },
        body: {
          _richText: true,
          _source: 'rich field doc',
          _todo: 'rich field todo',
          paragraphs: [[{ text: 'paragraph text' }]],
        },
      } as never)
      const out_obj = out as Record<string, unknown>
      expect(Object.keys(out_obj).sort()).toEqual(['body', 'strings'])
      expect('_source' in out_obj).toBe(false)
      expect('_todo' in out_obj).toBe(false)
    })

    it('throws when a sibling of "strings" is not a richText field', () => {
      expect(() =>
        seedLeafToPayloadData('bad_mixed', {
          strings: { foo: 'bar' },
          bad: 'this should be a richText field, not a string',
        } as never),
      ).toThrow(/is not a richText field/)
    })
  })

  describe('collectSeedTodos', () => {
    it('returns an empty array when no _todo markers exist', () => {
      const seed: SeedFile = {
        leaf_a: { foo: 'bar' },
        leaf_b: { strings: { x: 'y' } },
      }
      expect(collectSeedTodos(seed)).toEqual([])
    })

    it('collects leaf-level _todo markers', () => {
      const seed: SeedFile = {
        leaf_a: { _todo: 'verify against Figma', foo: 'bar' },
      }
      expect(collectSeedTodos(seed)).toEqual(['leaf_a: verify against Figma'])
    })

    it('collects richText-field _todo markers', () => {
      const seed: SeedFile = {
        leaf_a: {
          strings: { x: 'y' },
          body: {
            _richText: true,
            _todo: 'confirm link target',
            paragraphs: [[{ text: 'foo' }]],
          },
        },
      }
      expect(collectSeedTodos(seed)).toEqual(['leaf_a.body: confirm link target'])
    })

    it('collects both kinds in order', () => {
      const seed: SeedFile = {
        first_leaf: {
          _todo: 'leaf-level todo',
          strings: { foo: 'bar' },
          rich_a: { _richText: true, _todo: 'rich todo 1', paragraphs: [[{ text: 'a' }]] },
          rich_b: { _richText: true, paragraphs: [[{ text: 'b' }]] },
        },
        second_leaf: { _todo: 'second-leaf todo', foo: 'bar' },
      }
      expect(collectSeedTodos(seed)).toEqual([
        'first_leaf: leaf-level todo',
        'first_leaf.rich_a: rich todo 1',
        'second_leaf: second-leaf todo',
      ])
    })

    it('ignores the _meta envelope key', () => {
      const seed: SeedFile = {
        _meta: { _todo: 'this should NOT be collected — it is in _meta' },
        actual_leaf: { _todo: 'this should', foo: 'bar' },
      }
      expect(collectSeedTodos(seed)).toEqual(['actual_leaf: this should'])
    })
  })
})
