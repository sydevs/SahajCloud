
import translationsSchema from '@/globals/WeMeditateAppTranslations/translationsSchema.json' with { type: 'json' }
import { getLocaleLabel, isValidLocale } from '@/lib/locales'
import { type GroupSpec, type SectionSpec } from '@/lib/status'
import type { LeafLookup, SchemaNode } from '@/lib/translations/schemaWalker'
import { collectLeafLookups, extractPlainText } from '@/lib/translations/schemaWalker'

import { type WeMeditateAppStatusConfig } from './shared'

const tabProperties =
  (translationsSchema as { properties?: Record<string, SchemaNode> }).properties ?? {}
const tabEntries = Object.entries(tabProperties)

function isPopulated(translations: Record<string, unknown>, lookup: LeafLookup): boolean {
  const container: Record<string, unknown> = lookup.groupField
    ? ((translations[lookup.groupField] as Record<string, unknown> | undefined) ?? {})
    : translations

  if (lookup.innerKey === null) {
    const raw = container[lookup.fieldName]
    if (raw == null) return false
    return extractPlainText(raw).trim().length > 0
  }
  const blob = container[lookup.fieldName] as Record<string, unknown> | null | undefined
  if (!blob || typeof blob !== 'object') return false
  const value = blob[lookup.innerKey]
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Returns a human-readable label for a translation key suitable for display
 * in the missing-keys table.
 *
 * For string fields: returns dot-notation within the tab, e.g. "settings.logout"
 * or just "loading" for simple (non-nested) tabs.
 *
 * For richText fields: extracts the key name by stripping the enclosing slug
 * prefix from fieldName (e.g. "daily_welcome" → "welcome",
 * "settings_title" under groupField "profile" → "settings.title").
 */
function getLookupLabel(lookup: LeafLookup): string {
  if (lookup.innerKey !== null) {
    return lookup.groupField ? `${lookup.fieldName}.${lookup.innerKey}` : lookup.innerKey
  }
  // RichText: fieldName is "<slug>_<key>" — strip the leading slug prefix.
  if (lookup.groupField !== null) {
    // Nested tab: fieldName is "<subSlug>_<key>", groupField is the tab slug.
    const idx = lookup.fieldName.indexOf('_')
    if (idx > 0) {
      const subSlug = lookup.fieldName.slice(0, idx)
      const key = lookup.fieldName.slice(idx + 1)
      return `${subSlug}.${key}`
    }
  } else {
    // Simple tab: fieldName is "<tabSlug>_<key>".
    const idx = lookup.fieldName.indexOf('_')
    if (idx > 0) return lookup.fieldName.slice(idx + 1)
  }
  return lookup.fieldName
}

interface Ctx {
  translations: Record<string, unknown>
}

const tabAggregateGroups: GroupSpec<Ctx, WeMeditateAppStatusConfig>[] = tabEntries.map(
  ([tabSlug, tabSchema]) => {
    const lookups = collectLeafLookups(tabSlug, tabSchema)
    return {
      key: `translations-${tabSlug}`,
      label: `${tabSlug.charAt(0).toUpperCase()}${tabSlug.slice(1)} strings`,
      description: `Every key under the ${tabSlug.charAt(0).toUpperCase()}${tabSlug.slice(1)} translations tab has a non-empty value for this locale.`,
      type: 'aggregate',
      threshold: lookups.length,
      rowDisplay: 'collapse-passing',
      evaluate: async ({ translations }) => {
        const items = lookups.map((lookup) => {
          const label = getLookupLabel(lookup)
          return {
            id: label,
            label,
            checks: [{ key: 'is-populated', passed: isPopulated(translations, lookup) }],
          }
        })
        return { items }
      },
    }
  },
)

export const translationsSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'translations',
  label: 'Translations',
  description: 'Every translations tab has values for this locale and an admin has signed off.',
  tutorialLink: 'https://example.com/tutorials/translations',
  checks: {
    'is-published': {
      label: 'Translations published',
      description: 'The translations global is published for this locale.',
    },
    'is-populated': {
      label: 'Populated',
      description: 'This translation key has a non-empty value for the selected locale.',
    },
  },
  prepare: async ({ payload, locale, req }) => {
    const translations = (await payload.findGlobal({
      slug: 'wm-app-translations',
      locale,
      fallbackLocale: false,
      depth: 0,
      req,
    })) as unknown as Record<string, unknown>
    return { translations }
  },
  groups: [
    {
      key: 'publish-status',
      label: 'Publish status',
      description: 'Translations have been published for this locale.',
      type: 'documents',
      evaluate: async ({ translations }, { locale }) => {
        const isPublished = translations._status === 'published'
        const localeLabel = isValidLocale(locale) ? getLocaleLabel(locale) : locale
        return [
          {
            id: locale,
            label: `Translations in ${localeLabel}`,
            checks: [{ key: 'is-published', passed: isPublished }],
          },
        ]
      },
    },
    ...tabAggregateGroups,
  ],
}
