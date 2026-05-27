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
 * String keys live inside a JSON field named after the (possibly nested)
 * leaf slug — `data[leafSlug][key]`.
 *
 * RichText keys are stored as their own field named `<leafSlug>_<key>` —
 * `data[fieldName]`.
 */
interface LeafLookup {
  fieldName: string
  innerKey: string | null
}

function collectLeafLookups(tabSlug: string, tabNode: SchemaNode): LeafLookup[] {
  const out: LeafLookup[] = []

  function walk(node: SchemaNode, pathSegments: string[]): void {
    const props = node.properties ?? {}
    const leafSlug = pathSegments.join('_')
    for (const [key, child] of Object.entries(props)) {
      if (isObjectNode(child)) {
        walk(child, [...pathSegments, key])
      } else if (child.type === 'string') {
        out.push({ fieldName: leafSlug, innerKey: key })
      } else if (child.type === 'richText') {
        out.push({ fieldName: `${leafSlug}_${key}`, innerKey: null })
      }
    }
  }

  walk(tabNode, [tabSlug])
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
  if (lookup.innerKey === null) {
    const raw = translations[lookup.fieldName]
    if (raw == null) return false
    return extractPlainText(raw).trim().length > 0
  }
  const blob = translations[lookup.fieldName] as Record<string, unknown> | null | undefined
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
