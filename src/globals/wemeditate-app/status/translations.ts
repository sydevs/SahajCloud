import { type GroupSpec, type SectionSpec } from '@/lib/status'

import translationsSchema from '../translationsSchema.json' with { type: 'json' }
import { type WeMeditateAppStatusConfig } from './shared'

type LeafProp = { type: 'string' | 'richText' }
type SchemaNode = {
  type: 'object'
  description?: string
  properties?: Record<string, LeafProp | SchemaNode>
}

const tabProperties =
  (translationsSchema as { properties?: Record<string, SchemaNode> }).properties ?? {}
const tabEntries = Object.entries(tabProperties)

function isObjectNode(node: LeafProp | SchemaNode): node is SchemaNode {
  return node.type === 'object'
}

/**
 * Per-leaf-key descriptor for looking up the live value on a loaded global.
 *
 * For nested tabs (sub-groups wrapped in a Payload group), `groupField` is the
 * group name (e.g. `onboarding`) and `fieldName` is the sub-slug (e.g.
 * `welcome`). String keys live at `data[groupField][fieldName][key]`. RichText
 * keys live at `data[groupField][fieldName_key]`.
 *
 * For simple tabs (no sub-groups), `groupField` is null. String keys live at
 * `data[fieldName][key]`. RichText keys live at `data[fieldName_key]`.
 */
interface LeafLookup {
  groupField: string | null
  fieldName: string
  innerKey: string | null
}

function collectLeafLookups(tabSlug: string, tabNode: SchemaNode): LeafLookup[] {
  const out: LeafLookup[] = []
  const topLevelProps = tabNode.properties ?? {}
  const hasSubgroups = Object.values(topLevelProps).some(isObjectNode)

  if (!hasSubgroups) {
    // Simple tab: one JSON field named tabSlug containing all string keys.
    for (const [key, child] of Object.entries(topLevelProps)) {
      if (child.type === 'string') {
        out.push({ groupField: null, fieldName: tabSlug, innerKey: key })
      } else if (child.type === 'richText') {
        out.push({ groupField: null, fieldName: `${tabSlug}_${key}`, innerKey: null })
      }
    }
    return out
  }

  // Nested tab: each sub-group is a field under a Payload group named tabSlug.
  // API path: data[tabSlug][subSlug][key]
  for (const [subSlug, subSchema] of Object.entries(topLevelProps)) {
    if (!isObjectNode(subSchema)) continue
    for (const [key, child] of Object.entries(subSchema.properties ?? {})) {
      if (child.type === 'string') {
        out.push({ groupField: tabSlug, fieldName: subSlug, innerKey: key })
      } else if (child.type === 'richText') {
        out.push({ groupField: tabSlug, fieldName: `${subSlug}_${key}`, innerKey: null })
      }
    }
  }
  return out
}

function extractPlainText(node: unknown): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractPlainText).join('')
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (Array.isArray(obj.children)) return extractPlainText(obj.children)
    if (obj.root) return extractPlainText(obj.root)
  }
  return ''
}

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
      evaluate: async ({ translations }) =>
        lookups.filter((lookup) => isPopulated(translations, lookup)).length,
    }
  },
)

export const translationsSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'translations',
  label: 'Translations',
  description:
    'Every translations tab has values for this locale and an admin has signed off.',
  tutorialLink: null,
  checks: {
    'is-published': {
      label: 'Translations published',
      description: 'The translations global is published for this locale.',
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
        return [
          {
            id: locale,
            label: isPublished ? 'Published' : 'Not published',
            checks: [{ key: 'is-published', passed: isPublished }],
          },
        ]
      },
    },
    ...tabAggregateGroups,
  ],
}
