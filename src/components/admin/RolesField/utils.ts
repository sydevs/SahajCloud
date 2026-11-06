import type { RoleSlug } from '@/payload-types'

/**
 * One chip in the Roles select. `derived` marks a role read off a page, region
 * or event listing: it is shown beside the stored roles, but never stored.
 */
export type RoleChip = { derived: boolean; label: string; value: RoleSlug }

/**
 * The chips the Roles select renders: the derived roles, then the stored ones.
 *
 * Derived first because Backspace removes the *last* chip. A derived chip
 * there would absorb every press — it is put straight back — so no stored
 * role could be removed from the keyboard.
 */
export function roleChips(args: {
  derived: readonly RoleSlug[]
  labelOf: (role: RoleSlug) => string
  stored: readonly RoleSlug[]
}): RoleChip[] {
  const { derived, labelOf, stored } = args
  return [
    ...derived.map((value) => ({ derived: true, label: labelOf(value), value })),
    ...stored.map((value) => ({ derived: false, label: labelOf(value), value })),
  ]
}

/**
 * What a change to the select stores: every chip that is not derived.
 *
 * ⚠ This is the whole guarantee that a derived role never reaches `roles`.
 * Hiding a chip's remove button stops a click, but Backspace and the clear
 * button still emit a selection without it — and a derived value that did
 * reach a save would fail it, since `getRoleOptions` never offers one.
 */
export function storedRoles(
  selection: readonly { derived?: unknown; value: unknown }[] | null | undefined,
): RoleSlug[] {
  return (selection ?? [])
    .filter((chip) => chip.derived !== true)
    .map((chip) => chip.value as RoleSlug)
}

/** The line under the select that says why some chips cannot be removed. */
export function derivedRolesNote(labels: readonly string[]): string | null {
  if (labels.length === 0) return null
  const named =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
  const [verb, pronoun, applies] =
    labels.length === 1 ? ['is', 'it', 'applies'] : ['are', 'they', 'apply']
  return (
    `${named} ${verb} derived from this manager's page, region and event listings, so ${pronoun} ` +
    `${applies} in every locale and can't be removed here. Edit the listing instead.`
  )
}
