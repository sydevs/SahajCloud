/**
 * Branding Module
 *
 * Provides project brand colors and theme derivation utilities.
 * Single source of truth for all project color definitions.
 */

// Brand colors and types
export { PROJECT_BRAND_COLORS, getBrandColors } from './themeColors'
export type { BrandColors } from './themeColors'

// Admin elevation scales. The colour maths behind them stays a deep import.
export { ELEVATION_STEPS, PROJECT_THEMES, elevationVar } from './themeColors'

// The status and accent colours a project theme paints beside them.
export { ACCENT_VARS, PROJECT_ACCENTS, SUCCESS_SCALE } from './themeColors'

// Scalar theme derivation
export { deriveScalarTheme, getScalarThemeColors } from './themeColors'
export type { ScalarThemeColors } from './themeColors'

// Color utility functions
export { lighten, darken, tint, shade } from './themeColors'
