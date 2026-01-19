/**
 * Project Brand Colors - Single Source of Truth
 *
 * This module defines the core brand colors for each project.
 * All theme color derivations should use these values as their base.
 *
 * Consumers:
 * - src/lib/openapi/scalarPlugin.ts - Derives Scalar API docs theme
 * - src/components/branding/ProjectTheme.tsx - Uses for PayloadCMS admin elevation scales
 */

import type { ProjectSlug } from '@/payload-types'

// =============================================================================
// Brand Colors (Single Source of Truth)
// =============================================================================

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

// =============================================================================
// Color Utility Functions
// =============================================================================

/**
 * Convert hex color to HSL components
 * @throws Error if hex color format is invalid
 */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  // Remove # prefix if present
  const cleanHex = hex.replace('#', '')

  // Validate hex format (must be exactly 6 hex characters)
  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    throw new Error(`Invalid hex color format: "${hex}". Expected format: #RRGGBB or RRGGBB`)
  }

  // Parse RGB values
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255

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

/**
 * Convert HSL values to hex color
 */
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

// =============================================================================
// Scalar Theme Derivation
// =============================================================================

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
