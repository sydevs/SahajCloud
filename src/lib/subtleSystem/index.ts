/**
 * The closed set of 12 subtle-system nodes (chakras + nadis).
 *
 * Shared across owners — the `subtle-system-nodes` collection (the `slug`
 * select options), the Meditations `fallbackTitle` hook, and the admin
 * `FrameEditor` components — so it lives in `src/lib/` per project-structure
 * rule 4 rather than in any one collection's folder. Keeping it here (instead of
 * the collection file) also means the client-side FrameEditor can import it
 * without dragging server-only collection/editor code into the browser bundle.
 *
 * The migration that creates `subtle_system_nodes` seeds exactly these slugs;
 * adding/removing entries requires both a code change and a new migration.
 */
export const SUBTLE_SYSTEM_NODE_OPTIONS = [
  { label: 'Mooladhara', value: 'mooladhara' },
  { label: 'Swadhistan', value: 'swadhistan' },
  { label: 'Nabhi', value: 'nabhi' },
  { label: 'Void', value: 'void' },
  { label: 'Anahat', value: 'anahat' },
  { label: 'Vishuddhi', value: 'vishuddhi' },
  { label: 'Agnya', value: 'agnya' },
  { label: 'Sahasrara', value: 'sahasrara' },
  { label: 'Kundalini', value: 'kundalini' },
  { label: 'Right Channel', value: 'pingala' },
  { label: 'Left Channel', value: 'ida' },
  { label: 'Center Channel', value: 'sushumna' },
] as const

export type SubtleSystemNodeSlug = (typeof SUBTLE_SYSTEM_NODE_OPTIONS)[number]['value']

/**
 * Whether a string is one of the twelve slugs above.
 *
 * For a caller holding a slug read back from storage — a key of a meditation's
 * `subtleSystemNodeWeights` map — that has to answer a closed `select`'s own
 * options, or a generated union. A scan of the tuple rather than a lookup on an
 * object keyed by these values, which every inherited `Object` key would answer.
 */
export function isSubtleSystemNodeSlug(value: string): value is SubtleSystemNodeSlug {
  return SUBTLE_SYSTEM_NODE_OPTIONS.some((option) => option.value === value)
}

/**
 * The display label for a node slug, falling back to the slug itself for one
 * the list above does not hold.
 */
export function subtleSystemNodeLabel(slug: string): string {
  return SUBTLE_SYSTEM_NODE_OPTIONS.find((option) => option.value === slug)?.label ?? slug
}
