import type { FieldHook } from 'payload'

type LexicalNodeRecord = Record<string, unknown> & {
  children?: unknown
  relationTo?: unknown
  type?: unknown
  value?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDanglingReferenceNode(
  node: LexicalNodeRecord,
  validCollectionSlugs: Set<string>,
): boolean {
  if (node.type !== 'relationship' && node.type !== 'upload') return false

  if (typeof node.relationTo !== 'string') return true
  if (!validCollectionSlugs.has(node.relationTo)) return true

  return node.value === null || node.value === undefined
}

function sanitizeNodes(
  nodes: unknown[],
  validCollectionSlugs: Set<string>,
): { changed: boolean; nodes: unknown[] } {
  let changed = false
  const sanitized: unknown[] = []

  for (const node of nodes) {
    const result = sanitizeNode(node, validCollectionSlugs)
    if (result.changed) changed = true
    if (result.node === null) continue
    sanitized.push(result.node)
  }

  return { changed, nodes: sanitized }
}

function sanitizeNode(
  node: unknown,
  validCollectionSlugs: Set<string>,
): { changed: boolean; node: null | unknown } {
  if (!isRecord(node)) return { changed: false, node }

  if (isDanglingReferenceNode(node, validCollectionSlugs)) {
    return { changed: true, node: null }
  }

  if (!Array.isArray(node.children)) return { changed: false, node }

  const result = sanitizeNodes(node.children, validCollectionSlugs)
  if (!result.changed) return { changed: false, node }

  return {
    changed: true,
    node: {
      ...node,
      children: result.nodes,
    },
  }
}

export function removeDanglingLexicalReferences(
  value: unknown,
  validCollectionSlugs: Iterable<string>,
): unknown {
  if (!isRecord(value)) return value
  if (!isRecord(value.root)) return value
  if (!Array.isArray(value.root.children)) return value

  const result = sanitizeNodes(value.root.children, new Set(validCollectionSlugs))
  if (!result.changed) return value

  return {
    ...value,
    root: {
      ...value.root,
      children: result.nodes,
    },
  }
}

export const removeDanglingLexicalReferencesAfterRead: FieldHook = ({ req, value }) => {
  return removeDanglingLexicalReferences(value, Object.keys(req.payload.collections))
}
