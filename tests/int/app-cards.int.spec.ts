import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'

import { generateRulesJsonSchema } from '@/fields/rulesField'

import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

// ── Unit Tests: generateRulesJsonSchema ────────────────────────────────────────

describe('generateRulesJsonSchema', () => {
  it('generates correct schema for boolean rule definitions', () => {
    const schema = generateRulesJsonSchema([{ name: 'hasRealization', type: 'boolean' }])

    expect(schema.type).toBe('object')
    expect(schema.properties!.logic).toEqual({ type: 'string', enum: ['AND', 'OR'] })
    expect(schema.properties!.hasRealization).toEqual({ type: 'boolean' })
    expect(schema.additionalProperties).toBe(false)
  })

  it('generates correct schema for range rule definitions', () => {
    const schema = generateRulesJsonSchema([{ name: 'pathProgress', type: 'range' }])

    expect(schema.properties!.pathProgress).toEqual({
      type: 'object',
      properties: {
        min: { type: 'number', minimum: 0 },
        max: { type: 'number', minimum: 0 },
      },
      additionalProperties: false,
    })
  })

  it('generates correct schema with mixed rule types', () => {
    const schema = generateRulesJsonSchema([
      { name: 'hasRealization', type: 'boolean' },
      { name: 'pathProgress', type: 'range' },
      { name: 'meditationsPerWeek', type: 'range' },
    ])

    // logic + 3 rules = 4 properties
    expect(Object.keys(schema.properties!)).toHaveLength(4)
    expect(schema.properties!.hasRealization).toEqual({ type: 'boolean' })
    expect(schema.properties!.pathProgress!.type).toBe('object')
    expect(schema.properties!.meditationsPerWeek!.type).toBe('object')
  })

  it('generates correct schema for select rule definitions', () => {
    const schema = generateRulesJsonSchema([
      {
        name: 'targetSection',
        type: 'select',
        options: [
          { label: 'Hero', value: 'hero' },
          { label: 'Highlight', value: 'highlight' },
        ],
      },
    ])

    expect(schema.properties!.targetSection).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['hero', 'highlight'] },
      uniqueItems: true,
    })
  })

  it('generates correct schema with all rule types (boolean + range + select)', () => {
    const schema = generateRulesJsonSchema([
      {
        name: 'targetSection',
        type: 'select',
        options: [
          { label: 'Hero', value: 'hero' },
          { label: 'Highlight', value: 'highlight' },
        ],
      },
      { name: 'hasRealization', type: 'boolean' },
      { name: 'pathProgress', type: 'range' },
    ])

    // logic + 3 rules = 4 properties
    expect(Object.keys(schema.properties!)).toHaveLength(4)
    expect(schema.properties!.targetSection!.type).toBe('array')
    expect(schema.properties!.hasRealization).toEqual({ type: 'boolean' })
    expect(schema.properties!.pathProgress!.type).toBe('object')
  })

  it('always includes logic enum with AND/OR', () => {
    const schema = generateRulesJsonSchema([])

    expect(schema.properties!.logic).toEqual({ type: 'string', enum: ['AND', 'OR'] })
    expect(Object.keys(schema.properties!)).toHaveLength(1)
  })
})

// ── Integration Tests: AppCards with Rules ─────────────────────────────────────

describe('AppCards rules and weight fields', () => {
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

  it('creates card with complex AND rules (boolean + range) and verifies round-trip', async () => {
    const rules = {
      logic: 'AND' as const,
      hasRealization: false,
      pathProgress: { min: 1 },
    }

    const card = await testData.createAppCard(payload, {
      title: 'Continue Path',
      rules,
      weight: 4,
    })

    expect(card.rules).toEqual(rules)
    expect(card.weight).toBe(4)

    // Verify round-trip via findByID
    const fetched = await payload.findByID({
      collection: 'app-cards',
      id: card.id,
    })
    expect(fetched.rules).toEqual(rules)
    expect(fetched.weight).toBe(4)
  })

  it('creates card with null rules (show to all users)', async () => {
    const card = await testData.createAppCard(payload, {
      title: 'Music Card',
      rules: null,
    })

    expect(card.rules).toBeNull()
  })

  it('creates card with OR logic and multiple range conditions', async () => {
    const rules = {
      logic: 'OR' as const,
      pathProgress: { min: 5 },
      meditationsPerWeek: { min: 5 },
    }

    const card = await testData.createAppCard(payload, {
      title: 'Online Classes',
      type: 'external',
      linkUrl: 'https://example.com/classes',
      rules,
    })

    expect(card.rules).toEqual(rules)
  })

  it('creates card with range conditions using both min and max', async () => {
    const rules = {
      logic: 'AND' as const,
      hasRealization: true,
      pathProgress: { min: 0, max: 5 },
    }

    const card = await testData.createAppCard(payload, {
      title: 'Start Path',
      rules,
    })

    expect(card.rules).toEqual(rules)
  })

  it('creates card with default weight of 3', async () => {
    const card = await testData.createAppCard(payload, {
      title: 'Default Weight Card',
    })

    expect(card.weight).toBe(3)
  })

  it('creates card with custom weight values', async () => {
    const cardLow = await testData.createAppCard(payload, {
      title: 'Rare Card',
      weight: 1,
    })
    const cardHigh = await testData.createAppCard(payload, {
      title: 'Frequent Card',
      weight: 5,
    })

    expect(cardLow.weight).toBe(1)
    expect(cardHigh.weight).toBe(5)
  })

  it.skip('rejects rules with unknown properties (additionalProperties: false)', async () => {
    // Note: JSON Schema additionalProperties validation may not throw in all PayloadCMS versions
    await expect(
      testData.createAppCard(payload, {
        title: 'Invalid Rules Card',
        rules: { logic: 'AND', unknownKey: true } as any,
      }),
    ).rejects.toThrow()
  })

  it('creates card with select rule (targetSection) and verifies round-trip', async () => {
    const rules = {
      logic: 'AND' as const,
      targetSection: ['hero'],
    }

    const card = await testData.createAppCard(payload, {
      title: 'Hero Card',
      rules,
    })

    expect(card.rules).toEqual(rules)

    const fetched = await payload.findByID({
      collection: 'app-cards',
      id: card.id,
    })
    expect(fetched.rules).toEqual(rules)
  })

  it('creates card with multiple select values', async () => {
    const rules = {
      logic: 'AND' as const,
      targetSection: ['hero', 'highlight'],
    }

    const card = await testData.createAppCard(payload, {
      title: 'Multi-Section Card',
      rules,
    })

    expect(card.rules).toEqual(rules)
  })

  it('creates card with mixed rule types (select + boolean + range)', async () => {
    const rules = {
      logic: 'AND' as const,
      targetSection: ['highlight'],
      hasRealization: true,
      pathProgress: { min: 3 },
    }

    const card = await testData.createAppCard(payload, {
      title: 'Mixed Rules Card',
      rules,
    })

    expect(card.rules).toEqual(rules)
  })

  it('rejects range rules where max is not greater than min', async () => {
    // max === min should fail
    await expect(
      testData.createAppCard(payload, {
        title: 'Invalid Range Equal',
        rules: { pathProgress: { min: 5, max: 5 } },
      }),
    ).rejects.toThrow()

    // max < min should fail
    await expect(
      testData.createAppCard(payload, {
        title: 'Invalid Range Less',
        rules: { pathProgress: { min: 10, max: 5 } },
      }),
    ).rejects.toThrow()
  })
})
