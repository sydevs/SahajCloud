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
  it('reads the worse stop, not the first one', () => {
    // A pale yellow brand: white clears neither stop, and the gradient's light
    // end is the one that decides it.
    expect(readableTextOn(['#ffff00', '#ffffe0'])).toBe('#000000')
    // ⚠ A dark brand on its own answers white, and a pale second stop flips it
    // — which is the whole reason both stops are read, and why a header over a
    // brand gradient can end up with black text on a dark primary.
    expect(readableTextOn(['#1E6C71'])).toBe('#ffffff')
    expect(readableTextOn(['#1E6C71', '#ffffe0'])).toBe('#000000')
    // ⚠ `colorField`'s validator accepts the short form, so a service really can
    // store `#ff0`. Read as six digits it is NaN, which answers white — the
    // defect this rule exists to prevent, written the other way round.
    expect(readableTextOn(['#ff0'])).toBe('#000000')
    expect(readableTextOn(['#ff0', '#ffffe0'])).toBe('#000000')
  })
})
