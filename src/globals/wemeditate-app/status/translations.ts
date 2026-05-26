import { type GroupSpec, type SectionSpec } from '@/lib/status'

import translationsSchema from '../translationsSchema.json' with { type: 'json' }
import { type WeMeditateAppStatusConfig } from './shared'

type TranslationSchemaTab = {
  type: 'object'
  description?: string
  properties?: Record<string, unknown>
}

const tabProperties =
  (translationsSchema as { properties?: Record<string, TranslationSchemaTab> }).properties ?? {}
const tabEntries = Object.entries(tabProperties)

function countLeafKeys(tab: TranslationSchemaTab): number {
  return tab.properties ? Object.keys(tab.properties).length : 0
}

function countNonEmptyKeys(
  tab: TranslationSchemaTab,
  data: Record<string, unknown> | null | undefined,
): number {
  if (!data || !tab.properties) return 0
  return Object.keys(tab.properties).filter((key) => {
    const value = data[key]
    return typeof value === 'string' && value.trim().length > 0
  }).length
}

interface Ctx {
  translations: Record<string, unknown>
}

const tabAggregateGroups: GroupSpec<Ctx, WeMeditateAppStatusConfig>[] = tabEntries.map(
  ([tabSlug, tabSchema]) => ({
    key: `translations-${tabSlug}`,
    label: `${tabSlug.charAt(0).toUpperCase()}${tabSlug.slice(1)} strings`,
    description: `Every key under the ${tabSlug.charAt(0).toUpperCase()}${tabSlug.slice(1)} translations tab has a non-empty value for this locale.`,
    type: 'aggregate',
    threshold: countLeafKeys(tabSchema),
    evaluate: async ({ translations }) =>
      countNonEmptyKeys(tabSchema, translations[tabSlug] as Record<string, unknown> | undefined),
  }),
)

export const translationsSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'translations',
  tutorialLink: null,
  checks: {
    'reviewed-this-cycle': {
      label: 'Reviewed at least once',
      description: 'An admin has manually marked translations reviewed for this locale.',
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
    ...tabAggregateGroups,
    {
      key: 'manual-review',
      label: 'Manual review',
      description: 'An admin has marked translations reviewed for this locale at least once.',
      type: 'documents',
      evaluate: async ({ translations }, { locale }) => {
        const lastReviewedAt =
          typeof translations.lastReviewedAt === 'string' ? translations.lastReviewedAt : null
        return [
          {
            id: locale,
            label: lastReviewedAt ?? 'Never reviewed',
            checks: [{ key: 'reviewed-this-cycle', passed: lastReviewedAt !== null }],
          },
        ]
      },
    },
  ],
}
