import { describe, expect, it } from 'vitest'

import { metersBetween } from '@/collections/EventImports/resolve/distance'

/** Berlin Mitte — an arbitrary mid-latitude anchor. */
const BERLIN = { latitude: 52.52, longitude: 13.405 }
const PARIS = { latitude: 48.8566, longitude: 2.3522 }

describe('metersBetween', () => {
  it('is zero for one point', () => {
    expect(metersBetween(BERLIN, { ...BERLIN })).toBe(0)
  })

  it('measures a degree of latitude as a meridian degree', () => {
    // 2πR/360 for the mean radius. Pinning the absolute scale, not a ratio: a
    // wrong radius or a degrees-for-radians slip both survive every relative
    // assertion below.
    expect(metersBetween({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(
      111195.08,
      1,
    )
  })

  it('agrees with the published London–Paris great circle', () => {
    const london = { latitude: 51.5074, longitude: -0.1278 }
    // ~343.5 km. A third-party figure, so the tolerance is a kilometre.
    expect(metersBetween(london, PARIS)).toBeCloseTo(343_557, -3)
  })

  it('is symmetric', () => {
    expect(metersBetween(BERLIN, PARIS)).toBeCloseTo(metersBetween(PARIS, BERLIN), 6)
  })

  it('shrinks a degree of longitude with latitude', () => {
    const atEquator = metersBetween({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })
    const atBerlin = metersBetween(
      { latitude: 52.52, longitude: 0 },
      { latitude: 52.52, longitude: 1 },
    )
    // cos(52.52°) ≈ 0.6080 — the `Math.cos` pair in the formula. Dropping it
    // leaves both equal.
    expect(atBerlin / atEquator).toBeCloseTo(Math.cos((52.52 * Math.PI) / 180), 4)
  })

  it('measures an antipodal pair as half the circumference', () => {
    // ⚠ This does NOT cover the clamp, and no test can: `h` never floats far
    // enough above 1 for `sqrt` to exceed it, so deleting the clamp leaves
    // every pair green. It covers the formula at its far edge instead.
    for (const [from, to] of [
      [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }],
      [{ latitude: -88.4, longitude: 0 }, { latitude: 88.4, longitude: 180 }],
    ]) {
      const across = metersBetween(from!, to!)
      expect(Number.isFinite(across)).toBe(true)
      expect(across).toBeCloseTo(20_015_114, -2)
    }
  })
})
