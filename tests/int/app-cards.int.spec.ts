import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

let payload: Payload
let cleanup: () => Promise<void>
let sharedPageId: number

beforeAll(async () => {
  const testEnv = await createTestEnvironment()
  payload = testEnv.payload
  cleanup = testEnv.cleanup
  const page = await testData.createPage(payload, { title: 'Shared App Card Test Page' })
  sharedPageId = page.id
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

// ── Integration Tests: AppCards textColor field ───────────────────────────────

describe('AppCards textColor field', () => {
  it('defaults textColor to black when not set', async () => {
    const card = await testData.createAppCard(payload)
    expect(card.default?.textColor).toBe('black')
  })

  it('persists textColor: white in default view tab', async () => {
    const card = await testData.createAppCard(payload, {
      default: { textColor: 'white' },
    })
    expect(card.default?.textColor).toBe('white')

    const fetched = await payload.findByID({ collection: 'app-cards', id: card.id })
    expect(fetched.default?.textColor).toBe('white')
  })

  it('persists textColor: white in startingSoon view tab', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: { firstDate: futureDate.toISOString(), firstDate_tz: 'UTC', recurrenceType: 'DAILY', interval: 1 },
      startingSoon: { enabled: true, threshold: '1:00', title: 'Soon', textColor: 'white' },
    })

    expect(card.startingSoon?.textColor).toBe('white')
  })

  it('persists textColor: white in liveNow view tab', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: { firstDate: futureDate.toISOString(), firstDate_tz: 'UTC', recurrenceType: 'DAILY', interval: 1 },
      liveNow: { enabled: true, threshold: '0:00', title: 'Live', textColor: 'white' },
    })

    expect(card.liveNow?.textColor).toBe('white')
  })
})

// ── Integration Tests: AppCards aspectRatio field ─────────────────────────────

describe('AppCards aspectRatio field', () => {
  it('defaults aspectRatio to square when not set', async () => {
    const card = await testData.createAppCard(payload)
    expect(card.default?.aspectRatio).toBe('square')
  })

  it('persists aspectRatio: flexible in default view tab', async () => {
    const card = await testData.createAppCard(payload, {
      default: { aspectRatio: 'flexible' },
    })
    expect(card.default?.aspectRatio).toBe('flexible')

    const fetched = await payload.findByID({ collection: 'app-cards', id: card.id })
    expect(fetched.default?.aspectRatio).toBe('flexible')
  })

  it('persists aspectRatio: flexible in startingSoon view tab', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: { firstDate: futureDate.toISOString(), firstDate_tz: 'UTC', recurrenceType: 'DAILY', interval: 1 },
      startingSoon: { enabled: true, threshold: '1:00', title: 'Soon', aspectRatio: 'flexible' },
    })

    expect(card.startingSoon?.aspectRatio).toBe('flexible')
  })

  it('persists aspectRatio: flexible in liveNow view tab', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: { firstDate: futureDate.toISOString(), firstDate_tz: 'UTC', recurrenceType: 'DAILY', interval: 1 },
      liveNow: { enabled: true, threshold: '0:00', title: 'Live', aspectRatio: 'flexible' },
    })

    expect(card.liveNow?.aspectRatio).toBe('flexible')
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
        destination: 'page',
        page: sharedPageId,
      },
    })

    expect(card.default?.title).toBe('My Standard Card')
    expect(card.default?.header).toBe('My Header')
    expect(card.default?.destination).toBe('page')
    expect(typeof card.default?.page === 'number' ? card.default.page : (card.default?.page as { id: number })?.id).toBe(sharedPageId)
  })

  it('creates event card with type: event', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    // Anchor to 12:00 UTC (8am NY) so endTime '20:00' always passes NY start-time validation
    futureDate.setUTCHours(12, 0, 0, 0)
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

  it('computes viewSchedule virtual field for event card with both views enabled', async () => {
    // Pin to 15:00 UTC so threshold math produces predictable keys
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    futureDate.setUTCHours(15, 0, 0, 0)

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: {
        firstDate: futureDate.toISOString(),
        firstDate_tz: 'UTC',
        recurrenceType: 'DAILY',
        interval: 1,
        endTime: '16:00',
      },
      startingSoon: {
        enabled: true,
        threshold: '1:00', // 15:00 − 1h = 14:00 UTC
        title: 'Coming Soon',
      },
      liveNow: {
        enabled: true,
        threshold: '0:00', // starts exactly at event start = 15:00 UTC
        title: 'Happening Now',
      },
    })

    type ViewSchedule = { timezone: string; schedule: Record<string, string> }
    const viewSchedule = card.viewSchedule as ViewSchedule | null
    expect(viewSchedule).not.toBeNull()
    expect(viewSchedule!.timezone).toBe('UTC')
    const schedule = viewSchedule!.schedule
    expect(schedule['14:00']).toBe('startingSoon')
    expect(schedule['15:00']).toBe('liveNow')
    expect(schedule['16:00']).toBe('default')
  })

  it('returns default-only viewSchedule for standard cards; null for event cards with no enabled views', async () => {
    const standardCard = await testData.createAppCard(payload, { type: 'standard' })
    type ViewSchedule = { timezone: string; schedule: Record<string, string> }
    const vs = standardCard.viewSchedule as ViewSchedule
    expect(vs.timezone).toBe('UTC')
    expect(vs.schedule).toEqual({ '00:00': 'default' })

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const noViewsCard = await testData.createAppCard(payload, {
      type: 'event',
      schedule: {
        firstDate: futureDate.toISOString(),
        firstDate_tz: 'UTC',
        recurrenceType: 'DAILY',
        interval: 1,
      },
      // startingSoon and liveNow both disabled (default)
    })
    expect(noViewsCard.viewSchedule).toBeNull()
  })
})

// ── Integration Tests: AppCards destination field ─────────────────────────────

describe('AppCards destination field', () => {
  it('creates card with page destination', async () => {
    const card = await testData.createAppCard(payload, {
      default: { destination: 'page', page: sharedPageId },
    })

    expect(card.default?.destination).toBe('page')
    expect(typeof card.default?.page === 'number' ? card.default.page : (card.default?.page as { id: number })?.id).toBe(sharedPageId)
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

// ── Integration Tests: AppCards new fields (label, timings, icon, alignment) ──

describe('AppCards label field', () => {
  it('persists label and returns it on read', async () => {
    const card = await testData.createAppCard(payload, { label: 'My Internal Label' })

    expect(card.label).toBe('My Internal Label')

    const fetched = await payload.findByID({ collection: 'app-cards', id: card.id })
    expect(fetched.label).toBe('My Internal Label')
  })

  it('allows cards without a label (optional field)', async () => {
    const card = await payload.create({
      collection: 'app-cards',
      data: {
        type: 'standard',
        default: { title: 'No Label Card' },
      },
    })

    expect(card.label === null || card.label === undefined || card.label === '').toBe(true)
  })
})

describe('AppCards timings field', () => {
  it('persists a single timing value', async () => {
    const card = await testData.createAppCard(payload, { timings: ['morning'] })

    expect(card.timings).toEqual(['morning'])
  })

  it('persists multiple timing values', async () => {
    const card = await testData.createAppCard(payload, {
      timings: ['morning', 'evening', 'night'],
    })

    expect(card.timings).toEqual(['morning', 'evening', 'night'])
  })

  it('defaults to empty array when no timings set', async () => {
    const card = await testData.createAppCard(payload)

    expect(card.timings ?? []).toEqual([])
  })
})

describe('AppCards alignment field', () => {
  it('persists alignment in default view tab', async () => {
    const card = await testData.createAppCard(payload, {
      default: { alignment: 'center' },
    })

    expect(card.default?.alignment).toBe('center')
  })

  it('persists alignment in startingSoon view tab', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: { firstDate: futureDate.toISOString(), firstDate_tz: 'UTC', recurrenceType: 'DAILY', interval: 1 },
      startingSoon: { enabled: true, threshold: '1:00', title: 'Soon', alignment: 'left' },
    })

    expect(card.startingSoon?.alignment).toBe('left')
  })

  it('persists alignment in liveNow view tab', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: { firstDate: futureDate.toISOString(), firstDate_tz: 'UTC', recurrenceType: 'DAILY', interval: 1 },
      liveNow: { enabled: true, threshold: '0:00', title: 'Live', alignment: 'center' },
    })

    expect(card.liveNow?.alignment).toBe('center')
  })
})

describe('AppCards icon field', () => {
  it('persists icon in default view tab', async () => {
    const iconImage = await testData.createMediaImage(payload, { alt: 'Button icon' })

    const card = await testData.createAppCard(payload, {
      default: { buttonIcon: iconImage.id },
    })

    const iconId =
      typeof card.default?.buttonIcon === 'number'
        ? card.default.buttonIcon
        : (card.default?.buttonIcon as { id: number } | null)?.id
    expect(iconId).toBe(iconImage.id)
  })

  it('persists icon in startingSoon view tab', async () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)
    const iconImage = await testData.createMediaImage(payload, { alt: 'SS icon' })

    const card = await testData.createAppCard(payload, {
      type: 'event',
      schedule: { firstDate: futureDate.toISOString(), firstDate_tz: 'UTC', recurrenceType: 'DAILY', interval: 1 },
      startingSoon: { enabled: true, threshold: '1:00', title: 'Soon', buttonIcon: iconImage.id },
    })

    const iconId =
      typeof card.startingSoon?.buttonIcon === 'number'
        ? card.startingSoon.buttonIcon
        : (card.startingSoon?.buttonIcon as { id: number } | null)?.id
    expect(iconId).toBe(iconImage.id)
  })

  it('allows saving a card without icon (optional)', async () => {
    const card = await testData.createAppCard(payload)

    expect(card.default?.buttonIcon === null || card.default?.buttonIcon === undefined).toBe(true)
  })
})
