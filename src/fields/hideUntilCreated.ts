/**
 * An `admin.condition` that hides a field until the document has an id.
 *
 * A join, or any other virtual reverse relationship, is always empty before the
 * first save — nothing can point at an unsaved parent.
 *
 * Compose with another predicate by calling it explicitly:
 * `condition: (data) => hideUntilCreated(data) && data.isParent`.
 */
export const hideUntilCreated = (data?: { id?: unknown }): boolean => Boolean(data?.id)
