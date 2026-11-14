/**
 * Project Brand Colors - Single Source of Truth
 *
 * This module defines the core brand colors for each project.
 * All theme color derivations should use these values as their base.
 *
 * Consumers:
 * - src/plugins/openapi/scalarPlugin.ts - Derives Scalar API docs theme
 * - src/components/branding/ProjectTheme.tsx - Paints PROJECT_THEMES onto the admin panel
 */

import type { ProjectSlug } from '@/payload-types'

// --- Brand Colors (Single Source of Truth) ---

export interface BrandColors {
  /** Primary brand color (main accent) */
  primary: string
  /** Darker variant for hover/active states */
  dark: string
  /** Lighter variant for highlights */
  light: string
}

/**
 * Core brand colors for each project
 * These are the canonical color definitions from which all theme variations derive.
 */
export const PROJECT_BRAND_COLORS: Record<ProjectSlug, BrandColors> = {
  'wemeditate-web': {
    // Coral/Salmon - warm, inviting
    primary: '#F07855',
    dark: '#D86545',
    light: '#FF9477',
  },
  'wemeditate-app': {
    // Teal - calm, meditative
    primary: '#61aaa0',
    dark: '#4c8d84',
    light: '#72b3a9',
  },
  'sahaj-atlas': {
    // Royal Blue - exploration, wisdom
    primary: '#4a8cd4',
    dark: '#2d6db8',
    light: '#6fa3dd',
  },
}

// --- Color Utility Functions ---

/**
 * The three 0–255 channels of a hex colour.
 *
 * @throws Error if hex color format is invalid
 */
export function hexToRgb(hex: string): [number, number, number] {
  // Remove # prefix if present
  const cleanHex = hex.replace('#', '')

  // Validate hex format (must be exactly 6 hex characters)
  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    throw new Error(`Invalid hex color format: "${hex}". Expected format: #RRGGBB or RRGGBB`)
  }

  return [
    parseInt(cleanHex.substring(0, 2), 16),
    parseInt(cleanHex.substring(2, 4), 16),
    parseInt(cleanHex.substring(4, 6), 16),
  ]
}

/**
 * Convert hex color to HSL components
 * @throws Error if hex color format is invalid
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [red, green, blue] = hexToRgb(hex)
  const r = red / 255
  const g = green / 255
  const b = blue / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 }
}

/** Convert HSL values to hex color */
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100
  const lNorm = l / 100

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lNorm - c / 2

  let r = 0,
    g = 0,
    b = 0

  if (h >= 0 && h < 60) {
    r = c
    g = x
    b = 0
  } else if (h >= 60 && h < 120) {
    r = x
    g = c
    b = 0
  } else if (h >= 120 && h < 180) {
    r = 0
    g = c
    b = x
  } else if (h >= 180 && h < 240) {
    r = 0
    g = x
    b = c
  } else if (h >= 240 && h < 300) {
    r = x
    g = 0
    b = c
  } else if (h >= 300 && h < 360) {
    r = c
    g = 0
    b = x
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Lighten a color by increasing its lightness
 * @param hex - Hex color string
 * @param amount - Amount to increase lightness (0-100)
 */
export function lighten(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex)
  const newL = Math.min(100, l + amount)
  return hslToHex(h, s, newL)
}

/**
 * Darken a color by decreasing its lightness
 * @param hex - Hex color string
 * @param amount - Amount to decrease lightness (0-100)
 */
export function darken(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex)
  const newL = Math.max(0, l - amount)
  return hslToHex(h, s, newL)
}

/**
 * Mix a color with white (tint)
 * @param hex - Hex color string
 * @param ratio - Mix ratio (0 = original, 1 = white)
 */
export function tint(hex: string, ratio: number): string {
  const { h, s, l } = hexToHsl(hex)
  // Reduce saturation and increase lightness toward white
  const newS = s * (1 - ratio * 0.5)
  const newL = l + (100 - l) * ratio
  return hslToHex(h, newS, newL)
}

/**
 * Mix a color with black (shade)
 * @param hex - Hex color string
 * @param ratio - Mix ratio (0 = original, 1 = black)
 */
export function shade(hex: string, ratio: number): string {
  const { h, s, l } = hexToHsl(hex)
  // Reduce lightness toward black while maintaining some hue
  const newL = l * (1 - ratio)
  return hslToHex(h, s, newL)
}

// --- Admin Elevation Scales ---

/**
 * Payload's elevation scale, in order
 * (`node_modules/@payloadcms/ui/dist/scss/colors.scss`).
 *
 * ⚠ **A theme sets every one of these or none of them.** A step left unset
 * keeps Payload's own grey, so muted text renders grey between two tinted
 * neighbours.
 */
export const ELEVATION_STEPS = [
  0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950,
  1000,
] as const

/** The CSS custom property Payload reads one step from. */
export function elevationVar(step: number): string {
  return `--theme-elevation-${step}`
}

/** A theme variable → hex, one entry per step of the scale it carries. */
export type ElevationScale = Record<string, string>

export interface ThemeColors {
  light: ElevationScale
  dark: ElevationScale
}

/**
 * The share of the project hue's chroma a text step keeps. Payload's own text
 * steps are grey; at full chroma the Atlas's read as vivid blue, which in light
 * mode makes a read-only value look selected.
 */
export const TEXT_CHROMA = 0.3

/** The share a dark surface keeps. Surfaces are where a project's colour shows. */
const SURFACE_CHROMA = 0.55

/** The first step rendered as text rather than as a surface, per mode. */
export const TEXT_FROM = { dark: 400, light: 350 } as const

/** WCAG AA for body text. Every dark text step clears it on steps 0 and 50. */
const TEXT_CONTRAST = 4.5

/** Lightness per dark surface step, 0 through 350. */
const DARK_SURFACE_LIGHTNESS = [3.9, 9.5, 13, 16.5, 20.5, 24.5, 29, 33.5]

/** WCAG relative luminance, 0 for black and 1 for white. */
export function relativeLuminance(hex: string): number {
  const linear = (value: number) => {
    const v = value / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [low, high] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => x - y)
  return (high! + 0.05) / (low! + 0.05)
}

/**
 * The dimmest lightness at `hue`/`chroma` that `enough` accepts.
 *
 * `enough` must be monotone in lightness, and is asked about the **rounded**
 * hex, so the answer is the colour a browser paints rather than the one the
 * maths predicts.
 */
function dimmestLightness(hue: number, chroma: number, enough: (hex: string) => boolean): number {
  let low = 0
  let high = 100
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2
    if (enough(hslToHex(hue, chroma, mid))) high = mid
    else low = mid
  }
  return high
}

/**
 * The same colour with its chroma cut to `keep`, at the luminance it had.
 *
 * Cutting chroma alone moves the luminance, so re-solving the lightness is what
 * leaves the step's contrast against every other step exactly as it was.
 */
function withChroma(hex: string, keep: number): string {
  const { h, s } = hexToHsl(hex)
  if (s === 0) return hex
  const target = relativeLuminance(hex)
  const chroma = s * keep
  return hslToHex(
    h,
    chroma,
    dimmestLightness(h, chroma, (c) => relativeLuminance(c) >= target),
  )
}

/** The lightest of two colours, mixed evenly — in RGB, so a black endpoint adds no hue. */
function mixRgb(a: string, b: string): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const half = (x: number, y: number) =>
    Math.round((x + y) / 2)
      .toString(16)
      .padStart(2, '0')
  return `#${half(ar, br)}${half(ag, bg)}${half(ab, bb)}`
}

function scaleFrom(colors: string[]): ElevationScale {
  return Object.fromEntries(
    ELEVATION_STEPS.map((step, index) => [elevationVar(step), colors[index]!]),
  )
}

/**
 * A project's light scale: its hand-tuned steps, the seven it never set filled
 * in between them, and its text steps cut to `TEXT_CHROMA` at the luminance
 * they had — so the light palette's contrast is what it always was.
 */
function buildLightScale(anchors: Record<number, string>): ElevationScale {
  const filled = ELEVATION_STEPS.map((step, index) => {
    const anchor = anchors[step]
    if (anchor) return anchor
    return mixRgb(anchors[ELEVATION_STEPS[index - 1]!]!, anchors[ELEVATION_STEPS[index + 1]!]!)
  })
  return scaleFrom(
    filled.map((hex, index) =>
      ELEVATION_STEPS[index]! >= TEXT_FROM.light ? withChroma(hex, TEXT_CHROMA) : hex,
    ),
  )
}

/**
 * A project's dark scale, from its brand hue: the surface steps at the
 * lightnesses the hand-tuned scales used, then the text steps spread from the
 * dimmest one that clears `TEXT_CONTRAST` on step 50 up to white.
 *
 * The old scales ramped too slowly to reach that floor at all — the Atlas's
 * muted text read at 2.6:1 on the surface behind it.
 */
function buildDarkScale(brand: BrandColors): ElevationScale {
  const { h, s } = hexToHsl(brand.primary)
  const surfaces = DARK_SURFACE_LIGHTNESS.map((l) => hslToHex(h, s * SURFACE_CHROMA, l))
  const textChroma = s * TEXT_CHROMA
  const floor = dimmestLightness(
    h,
    textChroma,
    (hex) => contrastRatio(hex, surfaces[1]!) >= TEXT_CONTRAST,
  )
  const textSteps = ELEVATION_STEPS.filter((step) => step >= TEXT_FROM.dark)
  const text = textSteps.map((_, index) =>
    hslToHex(h, textChroma, floor + ((100 - floor) * index) / (textSteps.length - 1)),
  )
  return scaleFrom([...surfaces, ...text])
}

/**
 * The 14 steps each project's light palette was hand-tuned at. The rest of its
 * light scale, and the whole of its dark one, derive from these and the brand
 * colour above.
 */
const LIGHT_ANCHORS: Record<ProjectSlug, Record<number, string>> = {
  'wemeditate-web': {
    0: '#ffffff',
    50: '#fef5f3',
    100: '#fce4df',
    150: '#fad2c9',
    200: '#f8c0b3',
    250: '#f4a796',
    300: '#e08e79',
    400: '#c54d2e',
    500: '#b44528',
    600: '#8b3420',
    700: '#5f2318',
    800: '#4a1b12',
    900: '#2d100b',
    1000: '#000000',
  },
  'wemeditate-app': {
    0: '#ffffff',
    50: '#ebf4f3',
    100: '#c5e0dc',
    150: '#a3cec9',
    200: '#83bcb4',
    250: '#72b3a9',
    300: '#61aaa0',
    400: '#4c8d84',
    500: '#3d726b',
    600: '#2e5652',
    700: '#1f3a38',
    800: '#172826',
    900: '#0f1a19',
    1000: '#000000',
  },
  'sahaj-atlas': {
    0: '#ffffff',
    50: '#eff3fb',
    100: '#d6e3f5',
    150: '#b8d0ee',
    200: '#95bae6',
    250: '#6fa3dd',
    300: '#4a8cd4',
    400: '#2d6db8',
    500: '#245896',
    600: '#1c4374',
    700: '#142e52',
    800: '#0f2440',
    900: '#0a1829',
    1000: '#000000',
  },
}

/** Every project's admin elevation scale, both modes, all 21 steps. */
export const PROJECT_THEMES: Record<ProjectSlug, ThemeColors> = Object.fromEntries(
  (Object.keys(LIGHT_ANCHORS) as ProjectSlug[]).map((project) => [
    project,
    {
      light: buildLightScale(LIGHT_ANCHORS[project]),
      dark: buildDarkScale(PROJECT_BRAND_COLORS[project]),
    },
  ]),
) as Record<ProjectSlug, ThemeColors>

// --- Status Colours ---

/**
 * Payload's success scale, in order
 * (`node_modules/@payloadcms/ui/dist/scss/colors.scss`).
 */
export const SUCCESS_STEPS = [
  50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950,
] as const

/** The CSS custom property Payload reads one success step from. */
export function successVar(step: number): string {
  return `--theme-success-${step}`
}

/**
 * The hue every project's success colour is drawn at. Payload ships a blue
 * under that name, which reads as a second brand colour rather than as a
 * verdict, and is the Atlas's own hue outright. Far enough from all three
 * brand hues to stay a status.
 */
export const SUCCESS_HUE = 130

/** The hue Payload draws its own success ramp at. */
const PAYLOAD_SUCCESS_HUE = 200

/** Each of Payload's 19 success steps as `[saturation, lightness]`. */
const SUCCESS_RAMP: Array<[number, number]> = [
  [50.0, 95.3],
  [68.2, 91.4],
  [81.1, 85.5],
  [96.0, 80.2],
  [89.8, 73.1],
  [83.7, 66.3],
  [81.8, 59.0],
  [74.5, 50.8],
  [83.8, 43.5],
  [79.7, 40.6],
  [86.7, 35.3],
  [86.6, 32.2],
  [84.9, 28.6],
  [75.4, 27.1],
  [72.1, 23.9],
  [66.7, 21.2],
  [61.7, 18.4],
  [50.6, 15.1],
  [27.9, 12.0],
]

/**
 * Payload's ramp at `SUCCESS_HUE`: each step keeps that step's saturation and
 * its **luminance**, so every contrast a consumer was built against is the one
 * it had. Lightness cannot carry over — a green at a blue's lightness is far
 * brighter, and step 500, which paints every filled bar and status icon, would
 * read 2.6:1 on white where Payload's reads 4.2:1.
 */
function buildSuccessScale(): ThemeColors {
  const light = Object.fromEntries(
    SUCCESS_STEPS.map((step, index) => {
      const [saturation, lightness] = SUCCESS_RAMP[index]!
      const target = relativeLuminance(hslToHex(PAYLOAD_SUCCESS_HUE, saturation, lightness))
      return [
        successVar(step),
        hslToHex(
          SUCCESS_HUE,
          saturation,
          dimmestLightness(SUCCESS_HUE, saturation, (hex) => relativeLuminance(hex) >= target),
        ),
      ]
    }),
  )
  // Payload reverses the scale in dark mode, step 500 onto itself.
  const dark = Object.fromEntries(
    SUCCESS_STEPS.map((step, index) => [
      successVar(step),
      light[successVar(SUCCESS_STEPS[SUCCESS_STEPS.length - 1 - index]!)]!,
    ]),
  )
  return { light, dark }
}

/** The success scale every project paints, in both modes. */
export const SUCCESS_SCALE: ThemeColors = buildSuccessScale()

// --- Project Accent ---

/** The fill a chosen control takes, and the label colour that reads on it. */
export const ACCENT_VARS = { fill: '--project-accent', text: '--project-accent-text' } as const

/**
 * Payload paints a chosen control with the elevation scale's dark end, which
 * under a project theme is a near-black chip rather than the project's colour.
 * The brand's dark variant is, and it is the one of the three that stands off
 * a white page as well as a black one; black or white over it — whichever
 * reads — clears AA on all three.
 */
export const PROJECT_ACCENTS: Record<ProjectSlug, { fill: string; text: string }> =
  Object.fromEntries(
    (Object.keys(PROJECT_BRAND_COLORS) as ProjectSlug[]).map((project) => {
      const fill = PROJECT_BRAND_COLORS[project].dark
      const text =
        contrastRatio(fill, '#000000') >= contrastRatio(fill, '#ffffff') ? '#000000' : '#ffffff'
      return [project, { fill, text }]
    }),
  ) as Record<ProjectSlug, { fill: string; text: string }>

// --- Scalar Theme Derivation ---

/**
 * Theme colors for Scalar API documentation
 * Derived from brand colors for consistent theming.
 */
export interface ScalarThemeColors {
  accent: string
  accentDark: string
  accentLight: string
  background2Light: string
  background3Light: string
  background2Dark: string
  background3Dark: string
}

/**
 * Derive Scalar theme colors from brand colors
 * Creates a cohesive color scheme for Scalar API documentation.
 *
 * @param brand - Brand colors for the project
 * @returns Scalar-compatible theme colors
 */
export function deriveScalarTheme(brand: BrandColors): ScalarThemeColors {
  return {
    // Accent colors map directly to brand colors
    accent: brand.primary,
    accentDark: brand.dark,
    accentLight: brand.light,

    // Light mode backgrounds: very light tints of the brand color
    background2Light: tint(brand.primary, 0.92),
    background3Light: tint(brand.primary, 0.8),

    // Dark mode backgrounds: dark shades with brand hue
    background2Dark: shade(brand.primary, 0.85),
    background3Dark: shade(brand.primary, 0.75),
  }
}

/**
 * Get Scalar theme colors for a project
 * Returns null for no project (uses Scalar's default theme).
 *
 * @param project - Project slug or null for default theme
 * @returns Scalar theme colors or null
 */
export function getScalarThemeColors(project: ProjectSlug | null): ScalarThemeColors | null {
  if (!project) return null
  const brand = PROJECT_BRAND_COLORS[project]
  return deriveScalarTheme(brand)
}

/**
 * Get brand colors for a project
 * @param project - Project slug
 * @returns Brand colors for the project
 */
export function getBrandColors(project: ProjectSlug): BrandColors {
  return PROJECT_BRAND_COLORS[project]
}
