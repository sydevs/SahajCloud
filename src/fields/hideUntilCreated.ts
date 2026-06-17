/**
 * An `admin.condition` that hides a field until the document exists (has an id).
 *
 * Join (and other virtual reverse-relationship) fields are always empty before a
 * document is saved — nothing can point at an unsaved parent — so showing them on
 * the create screen is noise. Use this to defer them until after the first save:
 *
 * ```ts
 * { name: 'children', type: 'join', collection: 'regions', on: 'parent',
 *   admin: { condition: hideUntilCreated } }
 * ```
 *
 * Compose with an existing predicate by calling it explicitly:
 * `condition: (data) => hideUntilCreated(data) && data.isParent`.
 */
export const hideUntilCreated = (data?: { id?: unknown }): boolean => Boolean(data?.id)
