export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Extract a relationship id from any of the shapes Payload returns for
 * relationship/upload fields: a raw scalar (`number` / `string`) or a
 * populated `{ id }` object. Returns `null` for unset / unknown values.
 */
export function refId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (isRecord(value)) {
    const v = (value as { id?: unknown }).id
    if (typeof v === 'number' || typeof v === 'string') return v
  }
  return null
}

export function isUploadAssigned(value: unknown): boolean {
  return refId(value) !== null
}

/**
 * Best-effort human-readable label for a document. Falls back to a
 * short id-derived placeholder.
 */
export function labelOf(doc: { id: number | string; title?: unknown; name?: unknown }): string {
  if (typeof doc.title === 'string' && doc.title.trim().length > 0) return doc.title
  if (typeof doc.name === 'string' && doc.name.trim().length > 0) return doc.name
  return `#${doc.id}`
}

/**
 * Treat a Lexical rich-text value as "non-empty" if any descendant
 * carries real content (text, embedded relationship, block, etc.).
 */
export function richTextHasContent(value: unknown): boolean {
  if (!isRecord(value)) return false
  const root = (value as { root?: unknown }).root
  if (!isRecord(root)) return false
  const rootChildren = (root as { children?: unknown }).children
  if (!Array.isArray(rootChildren) || rootChildren.length === 0) return false

  const visit = (node: unknown): boolean => {
    if (!isRecord(node)) return false
    const t = (node as { type?: unknown }).type
    if (t === 'relationship' || t === 'upload' || t === 'block' || t === 'image') return true
    const text = (node as { text?: unknown }).text
    if (typeof text === 'string' && text.trim().length > 0) return true
    const children = (node as { children?: unknown }).children
    return Array.isArray(children) && children.some(visit)
  }

  return rootChildren.some(visit)
}

/**
 * Walk a Lexical tree and collect every relationship-node `id` whose
 * `relationTo` matches the supplied collection slug.
 */
export function collectRelationshipIds(value: unknown, relationTo: string): number[] {
  if (!isRecord(value)) return []
  const root = (value as { root?: unknown }).root
  if (!isRecord(root)) return []
  const rootChildren = (root as { children?: unknown }).children
  if (!Array.isArray(rootChildren)) return []

  const found = new Set<number>()
  const visit = (node: unknown): void => {
    if (!isRecord(node)) return
    if (node.type === 'relationship' && node.relationTo === relationTo) {
      const v = (node as { value?: unknown }).value
      if (typeof v === 'number') found.add(v)
      else if (isRecord(v) && typeof v.id === 'number') found.add(v.id)
    }
    const children = (node as { children?: unknown }).children
    if (Array.isArray(children)) children.forEach(visit)
  }
  rootChildren.forEach(visit)
  return Array.from(found)
}

export function containsRelationship(value: unknown, relationTo: string): boolean {
  return collectRelationshipIds(value, relationTo).length > 0
}

/**
 * Depth-first search for the first field with a matching `name` inside a
 * Payload field tree. Traverses `fields` arrays and `tabs[].fields` so
 * the caller doesn't need to know how the field is nested.
 */
export function findFieldByName(fields: unknown[], name: string): unknown {
  for (const field of fields) {
    if (!isRecord(field)) continue
    if (field.name === name) return field
    if (Array.isArray(field.fields)) {
      const found = findFieldByName(field.fields, name)
      if (found) return found
    }
    if (field.type === 'tabs' && Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        if (isRecord(tab) && Array.isArray(tab.fields)) {
          const found = findFieldByName(tab.fields, name)
          if (found) return found
        }
      }
    }
  }
  return undefined
}
