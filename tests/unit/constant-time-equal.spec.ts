import { describe, expect, it } from 'vitest'

import { constantTimeEqual } from '@/plugins/storage/cloudflareStreamWebhook'

describe('constantTimeEqual', () => {
  it('accepts an exact match', () => {
    expect(constantTimeEqual('s3cret-value', 's3cret-value')).toBe(true)
  })

  it('refuses a difference at the last byte', () => {
    expect(constantTimeEqual('s3cret-value', 's3cret-valuf')).toBe(false)
  })

  it('refuses unequal lengths rather than throwing', () => {
    expect(constantTimeEqual('short', 'considerably-longer')).toBe(false)
    expect(constantTimeEqual('', 'x')).toBe(false)
  })

  it('treats the empty string as equal to itself', () => {
    expect(constantTimeEqual('', '')).toBe(true)
  })

  // Equal `String.length`, unequal UTF-8 byte length: `timingSafeEqual` throws on
  // buffers of different sizes, so the byte-length pre-check is what stops a
  // non-ASCII secret crashing the caller instead of being refused.
  it('refuses equal-length strings whose encodings differ in size', () => {
    expect('é'.length).toBe('e'.length)
    expect(constantTimeEqual('é', 'e')).toBe(false)
    expect(constantTimeEqual('pässwort', 'passwort')).toBe(false)
  })

  it('accepts a match containing multi-byte characters', () => {
    expect(constantTimeEqual('pässwört-✓', 'pässwört-✓')).toBe(true)
  })
})
