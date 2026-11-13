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
  PROJECT_BRAND_COLORS,
  PROJECT_THEMES,
  TEXT_CHROMA,
  contrastRatio,
  hexToHsl,
  relativeLuminance,
} from '@/lib/branding'
import type { ProjectSlug } from '@/payload-types'

const PROJECTS = Object.keys(PROJECT_THEMES) as ProjectSlug[]
const MODES = ['light', 'dark'] as const

/** The first step rendered as text rather than as a surface, per mode. */
const TEXT_FROM = { dark: 400, light: 350 } as const

/** WCAG AA for body text. */
const AA = 4.5

const step = (project: ProjectSlug, mode: (typeof MODES)[number], value: number) =>
  PROJECT_THEMES[project][mode][`--theme-elevation-${value}`]!

describe('project elevation scales', () => {
  it('sets every one of Payload’s steps, in both modes', () => {
    for (const project of PROJECTS) {
      for (const mode of MODES) {
        const scale = PROJECT_THEMES[project][mode]
        expect(Object.keys(scale).sort()).toEqual(
          ELEVATION_STEPS.map((value) => `--theme-elevation-${value}`).sort(),
        )
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
