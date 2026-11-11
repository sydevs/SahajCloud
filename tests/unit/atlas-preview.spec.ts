// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ADJUSTMENT_REASONS,
  getCachedPaletteReport,
  PALETTE_REPORT_MESSAGE,
  ROLE_OF_FIELD,
  subscribePaletteReport,
  type PaletteReport,
} from '@/components/admin/AtlasPreview/paletteReport'
import { readableTextOn } from '@/lib/branding'
import { ATLAS_DEFAULT_COLORS } from '@/lib/clients/appearance'

/**
 * What the CMS believes about a service's colours comes from the atlas, over a
 * `window` message. So the two things worth pinning are which messages count,
 * and that every check the widget can report has words here to say it with.
 */
const post = (origin: string, roles: PaletteReport) =>
  window.dispatchEvent(
    new MessageEvent('message', { data: { roles, type: PALETTE_REPORT_MESSAGE }, origin }),
  )

const ATLAS = 'https://sahajatlas.com'

describe('the palette report', () => {
  const unsubscribes: (() => void)[] = []

  afterEach(() => {
    unsubscribes.splice(0).forEach((stop) => stop())
  })

  const listen = (origin: string, document: number = 7) => {
    const cb = vi.fn()
    unsubscribes.push(subscribePaletteReport(cb, origin, document))

    return cb
  }

  it('is heard from the preview iframe origin and from no other', () => {
    const cb = listen(ATLAS)
    const report: PaletteReport = {
      primary: {
        adjustedBy: ['surface'],
        dark: '#aa0',
        entered: '#ffff00',
        light: '#990',
        suggested: '#990',
      },
    }

    post('https://evil.example', report)

    expect(cb).not.toHaveBeenCalled()

    post(ATLAS, report)

    expect(cb).toHaveBeenCalledWith(report)
  })

  it('never hands one service the report of another', () => {
    // The message carries no id, so the subscriber supplies its own. Without it,
    // opening service 8 after service 7 would show 7's rendered colours under 8's
    // pickers — and offer a button writing 7's colour into 8.
    const report: PaletteReport = {
      primary: {
        adjustedBy: ['surface'],
        dark: '#aa0',
        entered: '#ffff00',
        light: '#990',
        suggested: '#990',
      },
    }

    listen(ATLAS, 7)
    post(ATLAS, report)

    expect(getCachedPaletteReport(7)).toEqual(report)
    expect(getCachedPaletteReport(8)).toEqual({})
  })

  it('drops a role whose shape would throw inside a picker', () => {
    const cb = listen(ATLAS, 9)

    post(ATLAS, {
      contrast: {
        adjustedBy: ['surface'],
        dark: '#111',
        entered: null,
        light: '#222',
        suggested: null,
      },
      primary: {
        adjustedBy: 'surface',
        dark: '#aa0',
        entered: null,
        light: '#990',
        suggested: null,
      },
    } as unknown as PaletteReport)

    expect(Object.keys(cb.mock.calls[0]![0] as PaletteReport)).toEqual(['contrast'])
  })

  it('maps each stored colour to the role the widget reports under', () => {
    // `BrandTheme` reads `color1`/`color2`/`color3` as these three, so a note
    // shown under the wrong picker would be worse than no note at all.
    expect(ROLE_OF_FIELD).toEqual({ color1: 'primary', color2: 'secondary', color3: 'contrast' })
  })

  it('has a sentence for every check the widget can report', () => {
    // The widget owns the check ids (sydevs/SahajAtlasWeb#389). A report naming
    // one with no sentence here would render an empty reason.
    expect(Object.keys(ADJUSTMENT_REASONS).sort()).toEqual([
      'panel-text',
      'selected-distinct',
      'surface',
    ])
  })
})

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
