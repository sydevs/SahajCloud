import type { FieldHook } from 'payload'

import { SUBTLE_SYSTEM_NODE_OPTIONS } from '@/collections/SubtleSystemNodes/SubtleSystemNodes'

const NODE_LABELS: Record<string, string> = Object.fromEntries(
  SUBTLE_SYSTEM_NODE_OPTIONS.map((option) => [option.value, option.label]),
)

/**
 * Pure helper: derive the optional auto-generated fallback title for a
 * meditation from its cached `subtleSystemNodeWeights` map
 * (`{ slug → on-screen seconds }`).
 *
 * Picks the slug with the highest weight (the node the meditation spends the
 * most on-screen time on), resolves it to its enum label via
 * `SUBTLE_SYSTEM_NODE_OPTIONS` (e.g. `anahat → "Anahat"`,
 * `pingala → "Right Channel"`), and returns `Meditation for <label>`.
 *
 * Returns `null` when there are no usable weights (no frames / no populated
 * nodes yet), so the front-end can fall back to its own composed label.
 * On a weight tie the first-inserted slug wins (insertion order mirrors the
 * frame timeline produced by `computeMeditationNodeWeights`).
 */
export function meditationTitleFromWeights(weights: unknown): string | null {
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

  if (topSlug === null) return null

  return `Meditation for ${NODE_LABELS[topSlug] ?? topSlug}`
}

/**
 * afterRead hook for the virtual `title` field. Reads the already-loaded
 * `subtleSystemNodeWeights` JSON off the meditation document — no extra DB
 * query — and computes the fallback title via `meditationTitleFromWeights`.
 */
export const fallbackTitleAfterRead: FieldHook = ({ data }) =>
  meditationTitleFromWeights(data?.subtleSystemNodeWeights)
