import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'

import { generateRulesJsonSchema } from '@/fields/rulesField'

import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

// ── Unit Tests: generateRulesJsonSchema ────────────────────────────────────────

describe('generateRulesJsonSchema', () => {
  it('generates correct schema for boolean rule definitions', () => {
    const schema = generateRulesJsonSchema([{ name: 'isMember', type: 'boolean' }])

    expect(schema.type).toBe('object')
    expect(schema.properties!.logic).toEqual({ type: 'string', enum: ['AND', 'OR'] })
    expect(schema.properties!.isMember).toEqual({ type: 'boolean' })
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
      { name: 'isMember', type: 'boolean' },
      { name: 'pathProgress', type: 'range' },
      { name: 'meditationsPerWeek', type: 'range' },
    ])

    // logic + 3 rules = 4 properties
    expect(Object.keys(schema.properties!)).toHaveLength(4)
    expect(schema.properties!.isMember).toEqual({ type: 'boolean' })
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
      { name: 'isMember', type: 'boolean' },
      { name: 'pathProgress', type: 'range' },
    ])

    // logic + 3 rules = 4 properties
    expect(Object.keys(schema.properties!)).toHaveLength(4)
    expect(schema.properties!.targetSection!.type).toBe('array')
    expect(schema.properties!.isMember).toEqual({ type: 'boolean' })
    expect(schema.properties!.pathProgress!.type).toBe('object')
  })

  it('always includes logic enum with AND/OR', () => {
    const schema = generateRulesJsonSchema([])

    expect(schema.properties!.logic).toEqual({ type: 'string', enum: ['AND', 'OR'] })
    expect(Object.keys(schema.properties!)).toHaveLength(1)
  })
})

// ── Integration Tests: AppCards audience, weight, targetSections ───────────────

// Shared test environment for all AppCards tests
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

describe('AppCards audience, weight, targetSections', () => {
  it('creates card with audience relationship to a viewer rule', async () => {
    const rule = await testData.createViewerRule(payload, {
      label: 'Path Started',
      rules: { pathProgress: { min: 1 } },
    })

    const card = await testData.createAppCard(payload, {
      title: 'Continue Path',
      audience: rule.id,
      weight: 4,
    })

    const audienceId =
      typeof card.audience === 'object' && card.audience !== null ? card.audience.id : card.audience
    expect(audienceId).toBe(rule.id)
    expect(card.weight).toBe(4)
  })

  it('creates card with null audience (hidden from viewer endpoint)', async () => {
    const card = await testData.createAppCard(payload, {
      title: 'Hidden Card',
      audience: null,
    })

    expect(card.audience).toBeNull()
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

  it('creates card with targetSections field (single value)', async () => {
    const card = await testData.createAppCard(payload, {
      title: 'Hero Card',
      targetSections: ['hero'],
    })

    expect(card.targetSections).toEqual(['hero'])

    const fetched = await payload.findByID({
      collection: 'app-cards',
      id: card.id,
    })
    expect(fetched.targetSections).toEqual(['hero'])
  })

  it('creates card with targetSections field (multiple values)', async () => {
    const card = await testData.createAppCard(payload, {
      title: 'Multi-Section Card',
      targetSections: ['hero', 'highlights'],
    })

    expect(card.targetSections).toEqual(['hero', 'highlights'])
  })

  it('creates card with targetSections and audience together', async () => {
    const rule = await testData.createViewerRule(payload, {
      label: 'Active Meditators',
      rules: { pathProgress: { min: 3 } },
    })

    const card = await testData.createAppCard(payload, {
      title: 'Mixed Fields Card',
      targetSections: ['highlights'],
      audience: rule.id,
    })

    expect(card.targetSections).toEqual(['highlights'])
    const audienceId =
      typeof card.audience === 'object' && card.audience !== null ? card.audience.id : card.audience
    expect(audienceId).toBe(rule.id)
  })
})

// ── Integration Tests: AppCards Overlay Field ─────────────────────────────────

describe('AppCards overlay field', () => {
  it('defaults overlay to false and persists overlay: true', async () => {
    const defaultCard = await testData.createAppCard(payload, { title: 'No Overlay' })
    expect(defaultCard.overlay).toBe(false)

    const overlayCard = await testData.createAppCard(payload, {
      title: 'With Overlay',
      overlay: true,
    })
    expect(overlayCard.overlay).toBe(true)

    const fetched = await payload.findByID({
      collection: 'app-cards',
      id: overlayCard.id,
    })
    expect(fetched.overlay).toBe(true)
  })
})

// ── Integration Tests: AppCards Countdown & Schedule ───────────────────────────

describe('AppCards countdown and schedule fields', () => {
  it('creates card with countdown: false (default) without schedule', async () => {
    const card = await testData.createAppCard(payload, {
      title: 'Regular Card',
      type: 'app-page',
      appPage: 'map',
    })

    expect(card.countdown).toBeFalsy()
    // Schedule field exists but should have no firstDate when countdown is false
    expect(card.schedule?.firstDate).toBeNull()
  })

  it('creates card with countdown: true and valid schedule data', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const dateString = futureDate.toISOString()

    const card = await testData.createAppCard(payload, {
      title: 'Countdown Card',
      type: 'app-page',
      appPage: 'path',
      countdown: true,
      schedule: {
        firstDate: dateString,
        firstDate_tz: 'America/New_York',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['MO'],
      },
    })

    expect(card.countdown).toBe(true)
    expect(card.schedule).toBeDefined()
    expect(card.schedule!.firstDate).toBe(dateString)
    expect(card.schedule!.firstDate_tz).toBe('America/New_York')
    expect(card.schedule!.recurrenceType).toBe('WEEKLY')
    expect(card.schedule!.interval).toBe(1)
  })

  it('computes icalRule and upcomingDates virtual fields for countdown cards', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const dateString = futureDate.toISOString()

    const card = await testData.createAppCard(payload, {
      title: 'Recurring Countdown',
      countdown: true,
      schedule: {
        firstDate: dateString,
        firstDate_tz: 'UTC',
        recurrenceType: 'DAILY',
        interval: 2,
      },
    })

    // Virtual fields should be computed by afterRead hook
    expect(card.schedule!.icalRule).toBeDefined()
    expect(card.schedule!.icalRule).toContain('DTSTART')
    expect(card.schedule!.icalRule).toContain('RRULE:FREQ=DAILY;INTERVAL=2')

    expect(card.schedule!.upcomingDates).toBeDefined()
    expect(Array.isArray(card.schedule!.upcomingDates)).toBe(true)
    expect(card.schedule!.upcomingDates!.length).toBeGreaterThan(0)
  })

  it('allows countdown cards with content type', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 1)
    const dateString = futureDate.toISOString()

    // Create a meditation first for the content relationship
    const meditation = await testData.createMeditation(payload, { title: 'Test Meditation' })

    const card = await testData.createAppCard(payload, {
      title: 'Content Countdown',
      type: 'content',
      // Polymorphic relationship requires explicit collection specification
      content: { relationTo: 'meditations', value: meditation.id },
      countdown: true,
      schedule: {
        firstDate: dateString,
        firstDate_tz: 'UTC',
        recurrenceType: 'DAILY',
        interval: 1,
      },
    })

    expect(card.countdown).toBe(true)
    expect(card.type).toBe('content')
    expect(card.schedule).toBeDefined()
  })

  it('allows countdown cards with external type', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 1)
    const dateString = futureDate.toISOString()

    const card = await testData.createAppCard(payload, {
      title: 'External Countdown',
      type: 'external',
      linkUrl: 'https://example.com',
      countdown: true,
      schedule: {
        firstDate: dateString,
        firstDate_tz: 'UTC',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['MO'],
      },
    })

    expect(card.countdown).toBe(true)
    expect(card.type).toBe('external')
    expect(card.schedule).toBeDefined()
  })
})
