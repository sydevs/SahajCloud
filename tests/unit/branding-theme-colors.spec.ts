/**
 * Integration tests for branding theme color utilities
 *
 * Tests the color conversion functions, derivation utilities, and Scalar theme generation.
 */
import { describe, it, expect } from 'vitest'

import {
  PROJECT_BRAND_COLORS,
  getBrandColors,
  lighten,
  darken,
  tint,
  shade,
  deriveScalarTheme,
  getScalarThemeColors,
  type BrandColors,
  type ScalarThemeColors,
} from '@/lib/branding'

describe('Brand Colors', () => {
  describe('PROJECT_BRAND_COLORS', () => {
    it('defines colors for all three projects', () => {
      expect(PROJECT_BRAND_COLORS['wemeditate-web']).toBeDefined()
      expect(PROJECT_BRAND_COLORS['wemeditate-app']).toBeDefined()
      expect(PROJECT_BRAND_COLORS['sahaj-atlas']).toBeDefined()
    })

    it('each project has primary, dark, and light colors', () => {
      const projects = ['wemeditate-web', 'wemeditate-app', 'sahaj-atlas'] as const

      for (const project of projects) {
        const colors = PROJECT_BRAND_COLORS[project]
        expect(colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/)
        expect(colors.dark).toMatch(/^#[0-9A-Fa-f]{6}$/)
        expect(colors.light).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })

    it('wemeditate-web has coral colors', () => {
      const colors = PROJECT_BRAND_COLORS['wemeditate-web']
      expect(colors.primary).toBe('#F07855')
      expect(colors.dark).toBe('#D86545')
      expect(colors.light).toBe('#FF9477')
    })

    it('wemeditate-app has teal colors', () => {
      const colors = PROJECT_BRAND_COLORS['wemeditate-app']
      expect(colors.primary).toBe('#61aaa0')
      expect(colors.dark).toBe('#4c8d84')
      expect(colors.light).toBe('#72b3a9')
    })

    it('sahaj-atlas has royal blue colors', () => {
      const colors = PROJECT_BRAND_COLORS['sahaj-atlas']
      expect(colors.primary).toBe('#4a8cd4')
      expect(colors.dark).toBe('#2d6db8')
      expect(colors.light).toBe('#6fa3dd')
    })
  })

  describe('getBrandColors', () => {
    it('returns brand colors for valid project', () => {
      const colors = getBrandColors('wemeditate-web')
      expect(colors).toEqual(PROJECT_BRAND_COLORS['wemeditate-web'])
    })
  })
})

describe('Color Utility Functions', () => {
  describe('lighten', () => {
    it('increases lightness of a color', () => {
      // Black (#000000) lightened should produce a gray
      const result = lighten('#000000', 50)
      expect(result).toMatch(/^#[0-9a-f]{6}$/)
      // Should be noticeably lighter than black
      expect(result).not.toBe('#000000')
    })

    it('handles maximum lightness (100)', () => {
      // Any color lightened by 100 should approach white
      const result = lighten('#F07855', 100)
      expect(result).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('handles zero amount (no change)', () => {
      const original = '#F07855'
      const result = lighten(original, 0)
      // Should be very close to original (may have minor floating point differences)
      expect(result.toLowerCase()).toBe(original.toLowerCase())
    })

    it('throws error for invalid hex format', () => {
      expect(() => lighten('invalid', 10)).toThrow('Invalid hex color format')
      expect(() => lighten('#GGG', 10)).toThrow('Invalid hex color format')
      expect(() => lighten('#12345', 10)).toThrow('Invalid hex color format')
      expect(() => lighten('', 10)).toThrow('Invalid hex color format')
    })
  })

  describe('darken', () => {
    it('decreases lightness of a color', () => {
      // White (#FFFFFF) darkened should produce a gray
      const result = darken('#FFFFFF', 50)
      expect(result).toMatch(/^#[0-9a-f]{6}$/)
      // Should be noticeably darker than white
      expect(result).not.toBe('#ffffff')
    })

    it('handles maximum darkness (100)', () => {
      // Any color darkened by 100 should be black
      const result = darken('#F07855', 100)
      expect(result).toBe('#000000')
    })

    it('handles zero amount (no change)', () => {
      const original = '#F07855'
      const result = darken(original, 0)
      expect(result.toLowerCase()).toBe(original.toLowerCase())
    })

    it('throws error for invalid hex format', () => {
      expect(() => darken('not-a-color', 10)).toThrow('Invalid hex color format')
    })
  })

  describe('tint', () => {
    it('mixes color with white (ratio 0 = original)', () => {
      const original = '#F07855'
      const result = tint(original, 0)
      expect(result.toLowerCase()).toBe(original.toLowerCase())
    })

    it('mixes color with white (ratio 1 approaches white)', () => {
      const result = tint('#F07855', 1)
      // Should be very light (close to white)
      expect(result).toMatch(/^#[0-9a-f]{6}$/)
      // Parse the lightness - should be high
      const r = parseInt(result.slice(1, 3), 16)
      const g = parseInt(result.slice(3, 5), 16)
      const b = parseInt(result.slice(5, 7), 16)
      const avg = (r + g + b) / 3
      expect(avg).toBeGreaterThan(200) // Should be very light
    })

    it('produces intermediate values for middle ratios', () => {
      const original = '#F07855'
      const tinted = tint(original, 0.5)
      expect(tinted).toMatch(/^#[0-9a-f]{6}$/)
      // Should be between original and white
      expect(tinted).not.toBe(original.toLowerCase())
      expect(tinted).not.toBe('#ffffff')
    })

    it('throws error for invalid hex format', () => {
      expect(() => tint('abc', 0.5)).toThrow('Invalid hex color format')
    })
  })

  describe('shade', () => {
    it('mixes color with black (ratio 0 = original)', () => {
      const original = '#F07855'
      const result = shade(original, 0)
      expect(result.toLowerCase()).toBe(original.toLowerCase())
    })

    it('mixes color with black (ratio 1 = black)', () => {
      const result = shade('#F07855', 1)
      expect(result).toBe('#000000')
    })

    it('produces intermediate values for middle ratios', () => {
      const original = '#F07855'
      const shaded = shade(original, 0.5)
      expect(shaded).toMatch(/^#[0-9a-f]{6}$/)
      // Should be between original and black
      expect(shaded).not.toBe(original.toLowerCase())
      expect(shaded).not.toBe('#000000')
    })

    it('throws error for invalid hex format', () => {
      expect(() => shade('#xyz123', 0.5)).toThrow('Invalid hex color format')
    })
  })

  describe('color conversion roundtrip', () => {
    // Testing that colors can be converted and manipulated consistently
    const testColors = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#F07855']

    it.each(testColors)('lighten(0) and darken(0) preserve color: %s', (color) => {
      expect(lighten(color, 0).toLowerCase()).toBe(color.toLowerCase())
      expect(darken(color, 0).toLowerCase()).toBe(color.toLowerCase())
    })

    it.each(testColors)('tint(0) and shade(0) preserve color: %s', (color) => {
      expect(tint(color, 0).toLowerCase()).toBe(color.toLowerCase())
      expect(shade(color, 0).toLowerCase()).toBe(color.toLowerCase())
    })
  })
})

describe('Scalar Theme Derivation', () => {
  describe('deriveScalarTheme', () => {
    it('returns all required Scalar theme properties', () => {
      const brand: BrandColors = {
        primary: '#F07855',
        dark: '#D86545',
        light: '#FF9477',
      }

      const theme = deriveScalarTheme(brand)

      expect(theme).toHaveProperty('accent')
      expect(theme).toHaveProperty('accentDark')
      expect(theme).toHaveProperty('accentLight')
      expect(theme).toHaveProperty('background2Light')
      expect(theme).toHaveProperty('background3Light')
      expect(theme).toHaveProperty('background2Dark')
      expect(theme).toHaveProperty('background3Dark')
    })

    it('uses brand colors directly for accent colors', () => {
      const brand: BrandColors = {
        primary: '#F07855',
        dark: '#D86545',
        light: '#FF9477',
      }

      const theme = deriveScalarTheme(brand)

      expect(theme.accent).toBe(brand.primary)
      expect(theme.accentDark).toBe(brand.dark)
      expect(theme.accentLight).toBe(brand.light)
    })

    it('generates valid hex colors for all background properties', () => {
      const brand: BrandColors = {
        primary: '#4a8cd4',
        dark: '#2d6db8',
        light: '#6fa3dd',
      }

      const theme = deriveScalarTheme(brand)

      expect(theme.background2Light).toMatch(/^#[0-9a-f]{6}$/)
      expect(theme.background3Light).toMatch(/^#[0-9a-f]{6}$/)
      expect(theme.background2Dark).toMatch(/^#[0-9a-f]{6}$/)
      expect(theme.background3Dark).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('generates light backgrounds that are lighter than primary', () => {
      const brand = PROJECT_BRAND_COLORS['wemeditate-web']
      const theme = deriveScalarTheme(brand)

      // Parse RGB values to compare lightness
      const primaryBrightness = getColorBrightness(brand.primary)
      const bg2LightBrightness = getColorBrightness(theme.background2Light)
      const bg3LightBrightness = getColorBrightness(theme.background3Light)

      expect(bg2LightBrightness).toBeGreaterThan(primaryBrightness)
      expect(bg3LightBrightness).toBeGreaterThan(primaryBrightness)
    })

    it('generates dark backgrounds that are darker than primary', () => {
      const brand = PROJECT_BRAND_COLORS['wemeditate-web']
      const theme = deriveScalarTheme(brand)

      const primaryBrightness = getColorBrightness(brand.primary)
      const bg2DarkBrightness = getColorBrightness(theme.background2Dark)
      const bg3DarkBrightness = getColorBrightness(theme.background3Dark)

      expect(bg2DarkBrightness).toBeLessThan(primaryBrightness)
      expect(bg3DarkBrightness).toBeLessThan(primaryBrightness)
    })
  })

  describe('getScalarThemeColors', () => {
    it('returns null for null project', () => {
      const result = getScalarThemeColors(null)
      expect(result).toBeNull()
    })

    it('returns Scalar theme for wemeditate-web', () => {
      const theme = getScalarThemeColors('wemeditate-web')
      expect(theme).not.toBeNull()
      expect(theme?.accent).toBe('#F07855')
    })

    it('returns Scalar theme for wemeditate-app', () => {
      const theme = getScalarThemeColors('wemeditate-app')
      expect(theme).not.toBeNull()
      expect(theme?.accent).toBe('#61aaa0')
    })

    it('returns Scalar theme for sahaj-atlas', () => {
      const theme = getScalarThemeColors('sahaj-atlas')
      expect(theme).not.toBeNull()
      expect(theme?.accent).toBe('#4a8cd4')
    })

    it('returns consistent results for same project', () => {
      const theme1 = getScalarThemeColors('wemeditate-web')
      const theme2 = getScalarThemeColors('wemeditate-web')
      expect(theme1).toEqual(theme2)
    })
  })
})

/**
 * Helper to calculate perceived brightness (0-255)
 * Uses standard luminance formula
 */
function getColorBrightness(hex: string): number {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)
  // Standard perceived brightness formula
  return (r * 299 + g * 587 + b * 114) / 1000
}
