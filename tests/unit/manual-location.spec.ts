import { describe, expect, it } from 'vitest'

import { isManualMapboxId, makeManualMapboxId, MANUAL_PREFIX } from '@/lib/mapbox/manualLocation'

/**
 * Hand-entered locations are now stored as a unique `manual-<suffix>` id (so they
 * coexist with the `mapboxId` unique constraint) while still being recognised as
 * "manual" by prefix. These pure helpers back that scheme.
 */
describe('manualLocation helpers', () => {
  describe('isManualMapboxId', () => {
    it('recognises the bare legacy sentinel and any manual- prefix', () => {
      expect(isManualMapboxId(MANUAL_PREFIX)).toBe(true)
      expect(isManualMapboxId('manual')).toBe(true)
      expect(isManualMapboxId('manual-3f2a')).toBe(true)
      expect(isManualMapboxId('manual-city:42')).toBe(true)
    })

    it('rejects real Mapbox ids and non-strings', () => {
      expect(isManualMapboxId('place.12345')).toBe(false)
      expect(isManualMapboxId('poi.abc')).toBe(false)
      expect(isManualMapboxId('manually')).toBe(false) // prefix must be `manual-`, not just leading text
      expect(isManualMapboxId('')).toBe(false)
      expect(isManualMapboxId(undefined)).toBe(false)
      expect(isManualMapboxId(null)).toBe(false)
      expect(isManualMapboxId(42)).toBe(false)
    })
  })

  describe('makeManualMapboxId', () => {
    it('is deterministic for a given seed and stays recognisably manual', () => {
      expect(makeManualMapboxId('city:42')).toBe('manual-city:42')
      expect(makeManualMapboxId('city:42')).toBe(makeManualMapboxId('city:42'))
      expect(isManualMapboxId(makeManualMapboxId('center:7'))).toBe(true)
    })

    it('generates a unique value when no seed is given', () => {
      const a = makeManualMapboxId()
      const b = makeManualMapboxId()
      expect(a).not.toBe(b)
      expect(isManualMapboxId(a)).toBe(true)
    })
  })
})
