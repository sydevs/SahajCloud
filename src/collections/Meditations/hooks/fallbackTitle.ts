import type { FieldHook } from 'payload'

import {
  isSubtleSystemNodeSlug,
  subtleSystemNodeLabel,
  type SubtleSystemNodeSlug,
} from '@/lib/subtleSystem'

/**
 * The slug a meditation spends the most on-screen time on, read from its cached
 * `subtleSystemNodeWeights` map (`{ slug → on-screen seconds }`).
 *
 * On a weight tie the first-inserted slug wins — insertion order mirrors the
 * frame timeline `computeMeditationNodeWeights` produces. `null` when there are
 * no usable weights. The slug is raw, so an unknown one still reaches a caller.
 */
export function meditationDominantNode(weights: unknown): string | null {
  if (!weights || typeof weights !== 'object') return null

  let topSlug: string | null = null
  let topWeight = -Infinity
  for (const [slug, weight] of Object.entries(weights as Record<string, unknown>)) {
    if (typeof weight !== 'number' || !Number.isFinite(weight)) continue
    if (weight > topWeight) {
      topWeight = weight
      topSlug = slug
    }
  }

  return topSlug
}

/**
 * The English auto-generated fallback title for a meditation.
 *
 * `null` when there are no usable weights, so the front-end can fall back to
 * its own composed label.
 */
export function meditationTitleFromWeights(weights: unknown): string | null {
  const topSlug = meditationDominantNode(weights)
  if (topSlug === null) return null

  return `Meditation for ${subtleSystemNodeLabel(topSlug)}`
}

/**
 * The dominant node's language-neutral slug, for a site composing a
 * meditation's name in the visitor's own language.
 *
 * Narrowed to the closed node set, which is what keeps the virtual `titleNode`
 * field's answer inside its own `select` options and its generated union.
 */
export function meditationTitleNodeFromWeights(weights: unknown): SubtleSystemNodeSlug | null {
  const topSlug = meditationDominantNode(weights)
  if (topSlug === null || !isSubtleSystemNodeSlug(topSlug)) return null

  return topSlug
}

/**
 * afterRead hook for the virtual `title` field. Reads the already-loaded
 * `subtleSystemNodeWeights` JSON off the meditation document — no extra DB
 * query — and computes the fallback title via `meditationTitleFromWeights`.
 */
export const fallbackTitleAfterRead: FieldHook = ({ data }) =>
  meditationTitleFromWeights(data?.subtleSystemNodeWeights)

/** afterRead hook for the virtual `titleNode` field. Same read, no extra query. */
export const titleNodeAfterRead: FieldHook = ({ data }) =>
  meditationTitleNodeFromWeights(data?.subtleSystemNodeWeights)
