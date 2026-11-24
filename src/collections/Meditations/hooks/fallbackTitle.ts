import type { FieldHook } from 'payload'

import { SUBTLE_SYSTEM_NODE_OPTIONS, type SubtleSystemNodeSlug } from '@/lib/subtleSystem'

const NODE_LABELS: Record<string, string> = Object.fromEntries(
  SUBTLE_SYSTEM_NODE_OPTIONS.map((option) => [option.value, option.label]),
)

/** A `Set`, not `in NODE_LABELS` — every inherited `Object` key answers that. */
const NODE_SLUGS = new Set<string>(SUBTLE_SYSTEM_NODE_OPTIONS.map((option) => option.value))

/**
 * Pure helper: the slug a meditation spends the most on-screen time on, read
 * from its cached `subtleSystemNodeWeights` map (`{ slug → on-screen seconds }`).
 *
 * Returns `null` when there are no usable weights (no frames / no populated
 * nodes yet). On a weight tie the first-inserted slug wins (insertion order
 * mirrors the frame timeline produced by `computeMeditationNodeWeights`).
 *
 * The slug is raw, so an unknown one still reaches a caller. Both fields below
 * derive from this one argmax, so they cannot name different nodes.
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
 * Pure helper: the English auto-generated fallback title for a meditation.
 *
 * Resolves {@link meditationDominantNode} to its enum label via
 * `SUBTLE_SYSTEM_NODE_OPTIONS` (e.g. `anahat → "Anahat"`,
 * `pingala → "Right Channel"`) and returns `Meditation for <label>`, falling
 * back to the raw slug for one the closed set does not hold.
 *
 * Returns `null` when there are no usable weights, so the front-end can fall
 * back to its own composed label.
 */
export function meditationTitleFromWeights(weights: unknown): string | null {
  const topSlug = meditationDominantNode(weights)
  if (topSlug === null) return null

  return `Meditation for ${NODE_LABELS[topSlug] ?? topSlug}`
}

/**
 * Pure helper: the dominant node's language-neutral slug, for a site composing
 * a meditation's name in the visitor's own language.
 *
 * Narrowed to the closed node set, which is what keeps the virtual `titleNode`
 * field's answer inside its own `select` options. The narrowing is unreachable
 * in practice — the weights map is keyed by `subtle-system-nodes.slug`, itself a
 * select over the same 12 values — so `title` and `titleNode` are non-null
 * together, which the related-meditations card relies on.
 */
export function meditationTitleNodeFromWeights(weights: unknown): SubtleSystemNodeSlug | null {
  const topSlug = meditationDominantNode(weights)
  if (topSlug === null || !NODE_SLUGS.has(topSlug)) return null

  return topSlug as SubtleSystemNodeSlug
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
