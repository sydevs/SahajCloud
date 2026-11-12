import { describe, expect, it } from 'vitest'

import { readableTextOn } from '@/lib/branding'
import { ATLAS_DEFAULT_COLORS } from '@/lib/clients/appearance'

describe('readableTextOn', () => {
  it('falls to the worse stop when one colour is illegible there', () => {
    // A pale yellow brand: white clears neither stop, and the gradient's light
    // end is the one that decides it.
    expect(readableTextOn('#ffff00', '#ffffe0')).toBe('#000000')
    // ⚠ A dark brand on its own answers white, and a pale second stop flips it
    // — black reads over the whole gradient at 3.44, where white vanishes at
    // 1.02 on the light end. This is why the gradient still binds.
    expect(readableTextOn('#1E6C71')).toBe('#ffffff')
    expect(readableTextOn('#1E6C71', '#ffffe0')).toBe('#000000')
    // ⚠ `colorField`'s validator accepts the short form, so a service really can
    // store `#ff0`. Read as six digits it is NaN, which answers white — the
    // defect this rule exists to prevent, written the other way round.
    expect(readableTextOn('#ff0')).toBe('#000000')
    expect(readableTextOn('#ff0', '#ffffe0')).toBe('#000000')
  })

  it('lets the painted stop decide while both stay legible', () => {
    // ⚠ `ATLAS_DEFAULT_COLORS`. Black scores 3.44 and white 3.15 across the
    // gradient — both legible, and 0.29 apart. On `#1E6C71` alone, the whole
    // surface wherever the gradient is dropped, white scores 6.11 to black's
    // 3.44. The worse stop would spend that for nothing.
    expect(readableTextOn(ATLAS_DEFAULT_COLORS.color1, ATLAS_DEFAULT_COLORS.color2)).toBe('#ffffff')
    // The three project brands pick black either way: white clears no stop of
    // any of them, so only a service palette can reach the branch above.
    expect(readableTextOn('#F07855', '#FF9477')).toBe('#000000')
    expect(readableTextOn('#61aaa0', '#72b3a9')).toBe('#000000')
    expect(readableTextOn('#4a8cd4', '#6fa3dd')).toBe('#000000')
  })
})
