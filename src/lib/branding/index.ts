/**
 * Branding Module
 *
 * Provides project brand colors and theme derivation utilities.
 * Single source of truth for all project color definitions.
 */

// Brand colors and types
export { PROJECT_BRAND_COLORS, getBrandColors } from './themeColors'
export type { BrandColors } from './themeColors'

// Scalar theme derivation
export { deriveScalarTheme, getScalarThemeColors } from './themeColors'
export type { ScalarThemeColors } from './themeColors'

// Color utility functions
export { lighten, darken, tint, shade } from './themeColors'
