import type { JSONField, TabsField } from 'payload'

import { describe, expect, it } from 'vitest'

import { WeMeditateAppStatusSpec } from '@/globals/wemeditate-app/status'
import { buildStatusGlobalConfig } from '@/lib/status'
import { READINESS_FIELD_COMPONENT_PATH } from '@/lib/status/virtualReadinessField'

/**
 * Pure config-shape contract. No Payload runtime — just reads the built
 * GlobalConfig and asserts that every virtual section field carries the
 * registration + admin.custom payload the ReadinessField component depends
 * on. Fails fast if a future refactor accidentally drops a field.
 */
describe('wm-app-status — ReadinessField registration contract', () => {
  const config = buildStatusGlobalConfig(WeMeditateAppStatusSpec)
  const tabsField = config.fields[0] as TabsField
  const statusTab = tabsField.tabs.find((tab) => tab.label === 'Status')
  if (!statusTab) {
    throw new Error('Expected a Status tab on wm-app-status')
  }
  // The Status tab leads with a `_readiness_banner` UI field; the section
  // virtual fields are the JSON ones.
  const sectionFields = (statusTab.fields as JSONField[]).filter((f) => f.type === 'json')

  const expectedSectionKeys = WeMeditateAppStatusSpec.sections.map((s) => s.key)

  it('exposes one virtual JSON field per spec section', () => {
    expect(sectionFields).toHaveLength(expectedSectionKeys.length)
    expect(sectionFields.map((f) => f.name).sort()).toEqual([...expectedSectionKeys].sort())
    for (const field of sectionFields) {
      expect(field.type).toBe('json')
      expect(field.virtual).toBe(true)
      expect(field.localized).toBe(true)
    }
  })

  it('hides the default label and registers the ReadinessField component', () => {
    for (const field of sectionFields) {
      expect(field.label).toBe(false)
      expect(field.admin?.readOnly).toBe(true)
      expect(field.admin?.components?.Field).toBe(READINESS_FIELD_COMPONENT_PATH)
    }
  })

  it.each(expectedSectionKeys)(
    'attaches a complete admin.custom payload for section "%s"',
    (sectionKey) => {
      const section = WeMeditateAppStatusSpec.sections.find((s) => s.key === sectionKey)
      const field = sectionFields.find((f) => f.name === sectionKey)
      if (!section || !field) {
        throw new Error(`Missing section/field for ${sectionKey}`)
      }

      const custom = field.admin?.custom as Record<string, unknown> | undefined
      expect(custom).toBeTruthy()

      // sectionMetadata
      const sectionMetadata = custom?.sectionMetadata as
        | { key: string; label: string; description: string; tutorialLink: string | null }
        | undefined
      expect(sectionMetadata?.key).toBe(sectionKey)
      expect(typeof sectionMetadata?.label).toBe('string')
      expect(sectionMetadata?.label.length).toBeGreaterThan(0)
      expect(typeof sectionMetadata?.description).toBe('string')
      expect(sectionMetadata?.description.length).toBeGreaterThan(0)
      expect(
        sectionMetadata?.tutorialLink === null || typeof sectionMetadata?.tutorialLink === 'string',
      ).toBe(true)

      // groupsMetadata — every declared group key has metadata
      const groupsMetadata = custom?.groupsMetadata as
        | Record<string, { label: string; description: string }>
        | undefined
      expect(groupsMetadata).toBeTruthy()
      for (const group of section.groups) {
        expect(groupsMetadata?.[group.key]?.label).toBe(group.label)
        expect(groupsMetadata?.[group.key]?.description).toBe(group.description)
      }

      // checksMetadata — exactly the section's declared checks
      const checksMetadata = custom?.checksMetadata as
        | Record<string, { label: string; description: string }>
        | undefined
      expect(Object.keys(checksMetadata ?? {}).sort()).toEqual(Object.keys(section.checks).sort())

      // groupKeyToCollection — one entry per group, value either a non-empty
      // string slug or null
      const groupKeyToCollection = custom?.groupKeyToCollection as
        | Record<string, string | null>
        | undefined
      expect(Object.keys(groupKeyToCollection ?? {}).sort()).toEqual(
        section.groups.map((g) => g.key).sort(),
      )
      for (const value of Object.values(groupKeyToCollection ?? {})) {
        expect(value === null || (typeof value === 'string' && value.length > 0)).toBe(true)
      }

      // configFallback — either null or a { type: 'global', slug } object
      const configFallback = custom?.configFallback as
        | { type: 'global'; slug: string }
        | null
        | undefined
      if (configFallback !== null && configFallback !== undefined) {
        expect(configFallback.type).toBe('global')
        expect(typeof configFallback.slug).toBe('string')
        expect(configFallback.slug.length).toBeGreaterThan(0)
      }
    },
  )

  it('deep-links collection-backed groups to known collection slugs', () => {
    const knownCollections = new Set(['user-choices', 'lessons', 'lectures', 'pages', 'app-cards'])
    for (const field of sectionFields) {
      const map = (field.admin?.custom as { groupKeyToCollection?: Record<string, string | null> })
        ?.groupKeyToCollection
      for (const value of Object.values(map ?? {})) {
        if (value === null) continue
        expect(knownCollections.has(value)).toBe(true)
      }
    }
  })
})
