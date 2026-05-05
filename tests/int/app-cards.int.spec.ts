import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'

import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

// ── Integration Tests: AppCards audiences, weight, targetSections ──────────────

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

function extractFirstAudienceId(audiences: unknown): number | null {
  if (!Array.isArray(audiences) || audiences.length === 0) return null
  const first = audiences[0]
  if (typeof first === 'number') return first
  if (typeof first === 'object' && first !== null && 'id' in first) {
    return (first as { id: number }).id
  }
  return null
}

describe('AppCards audiences, weight, targetSections', () => {
  it('creates card with audiences relationship to an audience', async () => {
    const audience = await testData.createAudience(payload, {
      label: 'Path Started',
      rules: { pathProgress: { min: 1 } },
    })

    const card = await testData.createAppCard(payload, {
      title: 'Continue Path',
      audiences: [audience.id],
      weight: 4,
    })

    expect(extractFirstAudienceId(card.audiences)).toBe(audience.id)
    expect(card.weight).toBe(4)
  })

  it('creates card with empty audiences (hidden from for-audience endpoint)', async () => {
    const card = await testData.createAppCard(payload, {
      title: 'Hidden Card',
      audiences: [],
    })

    expect(Array.isArray(card.audiences) ? card.audiences : []).toEqual([])
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

  it('creates card with targetSections and audiences together', async () => {
    const audience = await testData.createAudience(payload, {
      label: 'Active Meditators',
      rules: { pathProgress: { min: 3 } },
    })

    const card = await testData.createAppCard(payload, {
      title: 'Mixed Fields Card',
      targetSections: ['highlights'],
      audiences: [audience.id],
    })

    expect(card.targetSections).toEqual(['highlights'])
    expect(extractFirstAudienceId(card.audiences)).toBe(audience.id)
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
