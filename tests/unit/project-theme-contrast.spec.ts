/**
 * The admin elevation scales each project paints over Payload's greys.
 *
 * Two properties are the whole point of the derivation, and neither is visible
 * in a hex: every step is set, and a dark text step is readable on the surface
 * behind it.
 */
import { describe, expect, it } from 'vitest'

import {
  ELEVATION_STEPS,
  PROJECT_ACCENTS,
  PROJECT_BRAND_COLORS,
  PROJECT_THEMES,
  SUCCESS_HUE,
  SUCCESS_SCALE,
  SUCCESS_STEPS,
  TEXT_CHROMA,
  TEXT_FROM,
  contrastRatio,
  elevationVar,
  hexToHsl,
  relativeLuminance,
  successVar,
} from '@/lib/branding/themeColors'
import type { ProjectSlug } from '@/payload-types'

const PROJECTS = Object.keys(PROJECT_THEMES) as ProjectSlug[]
const MODES = ['light', 'dark'] as const

/** WCAG AA for body text. */
const AA = 4.5

/** WCAG AA for a graphical object: a bar's fill, an icon, a chosen segment. */
const AA_GRAPHIC = 3

/** The shorter way round the colour wheel, in degrees. */
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

const step = (project: ProjectSlug, mode: (typeof MODES)[number], value: number) =>
  PROJECT_THEMES[project][mode][elevationVar(value)]!

describe('project elevation scales', () => {
  it('sets every one of Payload’s steps, in both modes', () => {
    for (const project of PROJECTS) {
      for (const mode of MODES) {
        const scale = PROJECT_THEMES[project][mode]
        expect(Object.keys(scale).sort()).toEqual(ELEVATION_STEPS.map(elevationVar).sort())
        for (const hex of Object.values(scale)) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('keeps the endpoints Payload expects', () => {
    for (const project of PROJECTS) {
      expect(step(project, 'light', 0)).toBe('#ffffff')
      expect(step(project, 'light', 1000)).toBe('#000000')
      expect(step(project, 'dark', 1000)).toBe('#ffffff')
      // Dark step 0 is the page, so it stays near-black whatever the hue.
      expect(relativeLuminance(step(project, 'dark', 0))).toBeLessThan(0.02)
    }
  })

  it('darkens light and lightens dark, step by step', () => {
    for (const project of PROJECTS) {
      for (const mode of MODES) {
        const luminances = ELEVATION_STEPS.map((value) =>
          relativeLuminance(step(project, mode, value)),
        )
        for (let i = 1; i < luminances.length; i++) {
          const [previous, current] = [luminances[i - 1]!, luminances[i]!]
          if (mode === 'light') expect(current).toBeLessThan(previous)
          else expect(current).toBeGreaterThan(previous)
        }
      }
    }
  })

  it('reads dark text at AA on the surfaces behind it', () => {
    for (const project of PROJECTS) {
      for (const value of ELEVATION_STEPS.filter((s) => s >= TEXT_FROM.dark)) {
        const text = step(project, 'dark', value)
        expect(contrastRatio(text, step(project, 'dark', 0))).toBeGreaterThanOrEqual(AA)
        expect(contrastRatio(text, step(project, 'dark', 50))).toBeGreaterThanOrEqual(AA)
      }
    }
  })

  it('leaves a text step near-grey and a surface step coloured', () => {
    for (const project of PROJECTS) {
      const brand = hexToHsl(PROJECT_BRAND_COLORS[project].primary).s
      for (const mode of MODES) {
        for (const value of ELEVATION_STEPS) {
          const { l, s } = hexToHsl(step(project, mode, value))
          // Near black or white, 8-bit rounding dominates the chroma a hex
          // reports, so those steps say nothing either way.
          if (l < 10 || l > 85) continue
          if (value >= TEXT_FROM[mode]) expect(s).toBeLessThanOrEqual(brand * TEXT_CHROMA + 1)
          else expect(s).toBeGreaterThan(brand * TEXT_CHROMA)
        }
      }
    }
  })

  /**
   * Payload reads `--theme-text` off step 800 in light mode, so this is the
   * ratio most of the admin panel's text is read at. The expectations are what
   * the hand-tuned palettes measured before their text steps were desaturated:
   * cutting chroma at a fixed luminance is what keeps them.
   */
  it('leaves light body text at the contrast it had', () => {
    const before: Record<ProjectSlug, number> = {
      'sahaj-atlas': 15.59,
      'wemeditate-app': 15.35,
      'wemeditate-web': 14.42,
    }
    for (const project of PROJECTS) {
      const ratio = contrastRatio(step(project, 'light', 800), step(project, 'light', 0))
      expect(Math.abs(ratio - before[project])).toBeLessThan(0.1)
    }
  })
})

/**
 * Payload ships a blue under the name `success`, so a verified pill and a
 * filled bar read as a second brand colour. The green replacing it is one
 * colour under every project, and the ramp behind it is Payload's own — which
 * is what keeps each consumer's contrast where it was.
 */
describe('the success scale', () => {
  it('sets every one of Payload’s success steps, in both modes', () => {
    for (const mode of MODES) {
      const scale = SUCCESS_SCALE[mode]
      expect(Object.keys(scale).sort()).toEqual(SUCCESS_STEPS.map(successVar).sort())
      for (const hex of Object.values(scale)) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('darkens light and lightens dark, step by step', () => {
    for (const mode of MODES) {
      const luminances = SUCCESS_STEPS.map((value) =>
        relativeLuminance(SUCCESS_SCALE[mode][successVar(value)]!),
      )
      for (let i = 1; i < luminances.length; i++) {
        const [previous, current] = [luminances[i - 1]!, luminances[i]!]
        if (mode === 'light') expect(current).toBeLessThan(previous)
        else expect(current).toBeGreaterThan(previous)
      }
    }
  })

  /** Payload reverses its own status scales in dark mode, 500 onto itself. */
  it('reverses the scale in dark mode, as Payload does', () => {
    SUCCESS_STEPS.forEach((value, index) => {
      const mirror = SUCCESS_STEPS[SUCCESS_STEPS.length - 1 - index]!
      expect(SUCCESS_SCALE.dark[successVar(value)]).toBe(SUCCESS_SCALE.light[successVar(mirror)])
    })
  })

  it('is a green, and not any project’s own hue', () => {
    for (const value of SUCCESS_STEPS) {
      const { h, l } = hexToHsl(SUCCESS_SCALE.light[successVar(value)]!)
      // Near black or white, 8-bit rounding dominates the hue a hex reports.
      if (l < 10 || l > 85) continue
      expect(hueGap(h, SUCCESS_HUE)).toBeLessThan(5)
      for (const project of PROJECTS) {
        const brand = hexToHsl(PROJECT_BRAND_COLORS[project].primary).h
        expect(hueGap(h, brand)).toBeGreaterThan(30)
      }
    }
  })

  /**
   * The two pairs the tone vocabulary reads: step 500 as a solid fill on the
   * page, and `TONE_SURFACES.success`' text on its own tinted background.
   */
  it('reads on the page it is painted over, in every theme', () => {
    for (const project of PROJECTS) {
      for (const mode of MODES) {
        const fill = SUCCESS_SCALE[mode][successVar(500)]!
        expect(contrastRatio(fill, step(project, mode, 0))).toBeGreaterThanOrEqual(AA_GRAPHIC)
        const [text, surface] = [
          SUCCESS_SCALE[mode][successVar(700)]!,
          SUCCESS_SCALE[mode][successVar(50)]!,
        ]
        expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(AA)
      }
    }
  })
})

/**
 * A chosen control's fill. Payload's own pair is the elevation scale's dark
 * end, which under a project theme is a near-black chip.
 */
describe('the project accent', () => {
  it('is the project’s brand colour, with a label that reads on it', () => {
    for (const project of PROJECTS) {
      const { fill, text } = PROJECT_ACCENTS[project]
      expect(fill).toBe(PROJECT_BRAND_COLORS[project].dark)
      expect(contrastRatio(fill, text)).toBeGreaterThanOrEqual(AA)
    }
  })

  /**
   * Both bounds are the defect: a fill below 3:1 on the page is a chosen
   * segment nobody can pick out, and one above 7:1 is the near-black chip
   * step 800 drew, which reads 14.4:1 or better on a light page.
   */
  it('stands off the page in either mode, without reading as black', () => {
    for (const project of PROJECTS) {
      const { fill } = PROJECT_ACCENTS[project]
      for (const mode of MODES) {
        const ratio = contrastRatio(fill, step(project, mode, 0))
        expect(ratio).toBeGreaterThanOrEqual(AA_GRAPHIC)
        expect(ratio).toBeLessThanOrEqual(7)
      }
    }
  })
})
