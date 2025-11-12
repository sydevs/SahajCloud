/**
 * Centralized locale configuration for the application.
 * This is the single source of truth for all supported locales.
 */

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'fr', label: 'French' },
  { code: 'ru', label: 'Russian' },
  { code: 'ro', label: 'Romanian' },
  { code: 'cs', label: 'Czech' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'el', label: 'Greek' },
  { code: 'hy', label: 'Armenian' },
  { code: 'pl', label: 'Polish' },
  { code: 'pt-br', label: 'Brazilian Portuguese' },
  { code: 'fa', label: 'Farsi/Persian' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'tr', label: 'Turkish' },
] as const

/**
 * TypeScript type for locale codes
 */
export type LocaleCode = (typeof LOCALES)[number]['code']

/**
 * Default locale for the application
 */
export const DEFAULT_LOCALE: LocaleCode = 'en'

/**
 * Get locale label by code
 */
export function getLocaleLabel(code: LocaleCode): string {
  const locale = LOCALES.find((l) => l.code === code)
  return locale?.label || code
}

/**
 * Validate if a string is a valid locale code
 */
export function isValidLocale(code: string): code is LocaleCode {
  return LOCALES.some((l) => l.code === code)
}
