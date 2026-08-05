import type { TextFieldSingleValidation } from 'payload'

import { describe, expect, it } from 'vitest'

import { eventTitleValidate } from '@/collections/Events/hooks/eventTitle'

/**
 * The admin runs this in the browser, where **no hook runs** — so this is the
 * only thing standing between a manager and the "leave it blank" workflow the
 * field's own description recommends.
 */
type Options = Parameters<TextFieldSingleValidation>[1]

/**
 * Payload's own `text` validator reads `req.payload.config` and `req.t`, so the
 * stub has to carry them — this validator composes with it rather than
 * reimplementing its rules.
 */
const req = {
  payload: { config: { defaultMaxTextLength: 40000 } },
  t: (key: string) => key,
} as unknown as Options['req']

const opts = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ data, siblingData: data, required: true, req, ...extra }) as unknown as Options

const withAddress = { address: { venueName: 'Sunrise Hall', street: 'Hauptstr 1' } }
const withStreetOnly = { address: { street: 'Hauptstr 1, 2nd floor' } }
const noAddress = { eventType: 'online', onlineUrl: 'https://meet.example.org/x' }

describe('eventTitleValidate', () => {
  it('lets a blank title through when the venue can name it', () => {
    // The regression: the browser refused this, so a manager could never take
    // the auto-fill path the description tells them to take.
    expect(eventTitleValidate('', opts(withAddress))).toBe(true)
    expect(eventTitleValidate(null, opts(withAddress))).toBe(true)
    expect(eventTitleValidate(undefined, opts(withAddress))).toBe(true)
  })

  it('accepts a street with no venue name — the auto-fill uses its first segment', () => {
    expect(eventTitleValidate('', opts(withStreetOnly))).toBe(true)
  })

  it('still demands a title when there is no address to compose from', () => {
    // An online event has nothing to name it; the guarantee has to hold.
    const result = eventTitleValidate('', opts(noAddress))
    expect(typeof result).toBe('string')
    expect(result).toContain('venue address')
  })

  it('rejects a link', () => {
    expect(eventTitleValidate('Meditation https://example.org', opts(withAddress))).toContain(
      'Remove the link',
    )
    expect(eventTitleValidate('Meditation www.example.org', opts(withAddress))).toContain(
      'Remove the link',
    )
  })

  it('still enforces the length cap it composes with', () => {
    // Supplying `validate` replaces Payload's default, so `maxLength` only
    // survives because this defers to it.
    const result = eventTitleValidate('x'.repeat(101), opts(withAddress, { maxLength: 100 }))
    expect(typeof result).toBe('string')
  })

  it('accepts an ordinary title', () => {
    expect(eventTitleValidate('Meditation for Night-Shift Nurses', opts(withAddress))).toBe(true)
  })

  it('leaves a blank alone when the field is not required', () => {
    expect(eventTitleValidate('', opts(noAddress, { required: false }))).toBe(true)
  })
})
