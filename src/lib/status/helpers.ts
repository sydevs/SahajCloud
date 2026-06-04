export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Extract a relationship id from any of the shapes Payload returns for
 * relationship/upload fields: a raw scalar (`number` / `string`), a
 * populated `{ id }` object, or a polymorphic `{ relationTo, value }`
 * wrapper (whose `value` is itself a scalar id or a populated doc).
 * Returns `null` for unset / unknown values.
 */
export function refId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (isRecord(value)) {
    // Polymorphic relationship: unwrap { relationTo, value } and recurse.
    if ('relationTo' in value && 'value' in value) return refId(value.value)
    const v = value.id
    if (typeof v === 'number' || typeof v === 'string') return v
  }
  return null
}

export function isUploadAssigned(value: unknown): boolean {
  return refId(value) !== null
}

/**
 * Best-effort human-readable label for a document. Falls back to a
 * short id-derived placeholder, or `#unknown` if no id is present.
 */
export function labelOf(doc: {
  id: number | string | null | undefined
  title?: unknown
  name?: unknown
  label?: unknown
}): string {
  if (typeof doc.title === 'string' && doc.title.trim().length > 0) return doc.title
  if (typeof doc.name === 'string' && doc.name.trim().length > 0) return doc.name
  if (typeof doc.label === 'string' && doc.label.trim().length > 0) return doc.label
  if (doc.id == null) return '#unknown'
  return `#${doc.id}`
}

/**
 * Treat a Lexical rich-text value as "non-empty" if any descendant
 * carries real content (text, embedded relationship, block, etc.).
 */
export function richTextHasContent(value: unknown): boolean {
  if (!isRecord(value)) return false
  const root = value.root
  if (!isRecord(root)) return false
  const rootChildren = root.children
  if (!Array.isArray(rootChildren) || rootChildren.length === 0) return false

  const visit = (node: unknown): boolean => {
    if (!isRecord(node)) return false
    const t = node.type
    if (t === 'relationship' || t === 'upload' || t === 'block' || t === 'image') return true
    const text = node.text
    if (typeof text === 'string' && text.trim().length > 0) return true
    const children = node.children
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
  const root = value.root
  if (!isRecord(root)) return []
  const rootChildren = root.children
  if (!Array.isArray(rootChildren)) return []

  const found = new Set<number>()
  const visit = (node: unknown): void => {
    if (!isRecord(node)) return
    if (node.type === 'relationship' && node.relationTo === relationTo) {
      const v = node.value
      if (typeof v === 'number') found.add(v)
      else if (isRecord(v) && typeof v.id === 'number') found.add(v.id)
    }
    const children = node.children
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
