/**
 * Centralized locale configuration for the application.
 * This is the single source of truth for all supported locales.
 */

import type { Locale } from 'payload'

import ISO6391 from 'iso-639-1'

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

/**
 * Special case labels for locales not in ISO 639-1 or needing override
 */
const LOCALE_LABEL_OVERRIDES: Record<string, string> = {
  'pt-br': 'Brazilian Portuguese',
  fa: 'Farsi/Persian',
}

/**
 * Build PayloadCMS locale configuration with:
 * - Labels from ISO 639-1 (with fallback for special codes)
 * - RTL flag for Farsi
 * - Fallback locale for non-English locales
 *
 * @returns Array of PayloadCMS Locale configurations
 */
export function buildPayloadLocales(): Locale[] {
  return LOCALES.map(({ code }) => {
    // Get label from override or ISO 639-1
    // For compound codes like 'pt-br', try the full code first, then the base
    const baseCode = code.split('-')[0]
    const isoLabel = ISO6391.getName(baseCode)
    const label = LOCALE_LABEL_OVERRIDES[code] || isoLabel || code

    const locale: Locale = {
      code,
      label,
    }

    // Add RTL for Farsi
    if (code === 'fa') {
      locale.rtl = true
    }

    // Add fallback for non-English locales
    if (code !== 'en') {
      locale.fallbackLocale = 'en'
    }

    return locale
  })
}
