import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'

import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

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

// ── Integration Tests: AppCards audiences, weight, targetSections ──────────────

describe('AppCards audiences, weight, targetSections', () => {
  it('creates card with audiences relationship to an audience', async () => {
    const audience = await testData.createAudience(payload, {
      label: 'Path Started',
      rules: { pathProgress: { min: 1 } },
    })

    const card = await testData.createAppCard(payload, {
      audiences: [audience.id],
      weight: 4,
    })

    const firstAudienceId =
      Array.isArray(card.audiences) && card.audiences.length > 0
        ? typeof card.audiences[0] === 'number'
          ? card.audiences[0]
          : (card.audiences[0] as { id: number }).id
        : null
    expect(firstAudienceId).toBe(audience.id)
    expect(card.weight).toBe(4)
  })

  it('creates card with empty audiences (hidden from for-audience endpoint)', async () => {
    const card = await testData.createAppCard(payload, {
      audiences: [],
    })

    expect(Array.isArray(card.audiences) ? card.audiences : []).toEqual([])
  })

  it('creates card with default weight of 3', async () => {
    const card = await testData.createAppCard(payload)

    expect(card.weight).toBe(3)
  })

  it('creates card with custom weight values', async () => {
    const cardLow = await testData.createAppCard(payload, { weight: 1 })
    const cardHigh = await testData.createAppCard(payload, { weight: 5 })

    expect(cardLow.weight).toBe(1)
    expect(cardHigh.weight).toBe(5)
  })

  it('creates card with targetSections field (single value)', async () => {
    const card = await testData.createAppCard(payload, {
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
      targetSections: ['highlights'],
      audiences: [audience.id],
    })

    expect(card.targetSections).toEqual(['highlights'])
    const firstId =
      Array.isArray(card.audiences) && card.audiences.length > 0
        ? typeof card.audiences[0] === 'number'
          ? card.audiences[0]
          : (card.audiences[0] as { id: number }).id
        : null
    expect(firstId).toBe(audience.id)
  })
})

// ── Integration Tests: AppCards overlay field ─────────────────────────────────

describe('AppCards overlay field', () => {
  it('defaults overlay to false and persists overlay: true', async () => {
    const defaultCard = await testData.createAppCard(payload)
    expect(defaultCard.default?.overlay).toBe(false)

    const overlayCard = await testData.createAppCard(payload, {
      default: { overlay: true },
    })
    expect(overlayCard.default?.overlay).toBe(true)

    const fetched = await payload.findByID({
      collection: 'app-cards',
      id: overlayCard.id,
    })
    expect(fetched.default?.overlay).toBe(true)
  })
})

// ── Integration Tests: AppCards type field ────────────────────────────────────

describe('AppCards type field', () => {
  it('creates standard card with type: standard', async () => {
    const card = await testData.createAppCard(payload, { type: 'standard' })

    expect(card.type).toBe('standard')
  })

  it('creates standard card with default view fields', async () => {
    const card = await testData.createAppCard(payload, {
      default: {
        title: 'My Standard Card',
        header: 'My Header',
        destination: 'appPage',
        appPage: 'map',
      },
    })

    expect(card.default?.title).toBe('My Standard Card')
    expect(card.default?.header).toBe('My Header')
    expect(card.default?.destination).toBe('appPage')
    expect(card.default?.appPage).toBe('map')
  })

  it('creates event card with type: event', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const dateString = futureDate.toISOString()

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: {
        firstDate: dateString,
        firstDate_tz: 'America/New_York',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['MO'],
        endTime: '20:00',
      },
    })

    expect(card.type).toBe('event')
    expect(card.schedule).toBeDefined()
    expect(card.schedule!.firstDate).toBe(dateString)
    expect(card.schedule!.firstDate_tz).toBe('America/New_York')
    expect(card.schedule!.recurrenceType).toBe('WEEKLY')
    expect(card.schedule!.interval).toBe(1)
  })

  it('computes icalRule and upcomingDates virtual fields for event cards', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const dateString = futureDate.toISOString()

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: {
        firstDate: dateString,
        firstDate_tz: 'UTC',
        recurrenceType: 'DAILY',
        interval: 2,
      },
    })

    expect(card.schedule!.icalRule).toBeDefined()
    expect(card.schedule!.icalRule).toContain('DTSTART')
    expect(card.schedule!.icalRule).toContain('RRULE:FREQ=DAILY;INTERVAL=2')

    expect(Array.isArray(card.schedule!.upcomingDates)).toBe(true)
    expect((card.schedule!.upcomingDates as unknown[]).length).toBeGreaterThan(0)
  })

  it('creates event card with startingSoon view enabled and custom threshold', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 3)

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: {
        firstDate: futureDate.toISOString(),
        firstDate_tz: 'UTC',
        recurrenceType: 'DAILY',
        interval: 1,
        endTime: '21:00',
      },
      startingSoon: {
        enabled: true,
        threshold: '2:00',
        title: 'Coming Soon',
      },
    })

    expect(card.type).toBe('event')
    expect(card.startingSoon?.enabled).toBe(true)
    expect(card.startingSoon?.threshold).toBe('2:00')
    expect(card.startingSoon?.title).toBe('Coming Soon')
  })

  it('creates event card with liveNow view enabled', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 3)

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: {
        firstDate: futureDate.toISOString(),
        firstDate_tz: 'UTC',
        recurrenceType: 'DAILY',
        interval: 1,
        endTime: '21:00',
      },
      liveNow: {
        enabled: true,
        threshold: '0:15',
        title: 'Happening Now',
      },
    })

    expect(card.liveNow?.enabled).toBe(true)
    expect(card.liveNow?.threshold).toBe('0:15')
    expect(card.liveNow?.title).toBe('Happening Now')
  })
})

// ── Integration Tests: AppCards destination field ─────────────────────────────

describe('AppCards destination field', () => {
  it('creates card with appPage destination', async () => {
    const card = await testData.createAppCard(payload, {
      default: { destination: 'appPage', appPage: 'lectures' },
    })

    expect(card.default?.destination).toBe('appPage')
    expect(card.default?.appPage).toBe('lectures')
  })

  it('creates card with url destination', async () => {
    const card = await testData.createAppCard(payload, {
      default: { destination: 'url', url: 'https://example.com' },
    })

    expect(card.default?.destination).toBe('url')
    expect(card.default?.url).toBe('https://example.com')
  })

  it('creates card with meditation destination', async () => {
    const meditation = await testData.createMeditation(payload, { title: 'Linked Meditation' })

    const card = await testData.createAppCard(payload, {
      default: {
        destination: 'meditation',
        meditation: meditation.id,
      },
    })

    expect(card.default?.destination).toBe('meditation')
    const meditationId =
      typeof card.default?.meditation === 'number'
        ? card.default.meditation
        : (card.default?.meditation as { id: number } | null)?.id
    expect(meditationId).toBe(meditation.id)
  })
})
