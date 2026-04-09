import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Migration: Unify index blocks into single ContentIndexBlock
 *
 * Consolidates three separate index blocks (meditations-index, pages-index,
 * songs-index) into a single content-index block with a type selector and
 * type-specific filter fields.
 *
 * Affected tables: pages_locales (content), _pages_v_locales (version_content)
 */

interface LexicalNode {
  type: string
  version?: number
  children?: LexicalNode[]
  root?: { children?: LexicalNode[] }
  fields?: Record<string, unknown>
}

/** Mapping from old blockType to new type value and filter field name */
const BLOCK_TYPE_MAP: Record<string, { type: string; filterField: string }> = {
  'meditations-index': { type: 'meditations', filterField: 'meditationFilters' },
  'pages-index': { type: 'pages', filterField: 'pageFilters' },
  'songs-index': { type: 'songs', filterField: 'songFilters' },
}

/** Reverse mapping from type value to old blockType */
const TYPE_TO_BLOCK_MAP: Record<string, { blockType: string; filterField: string }> = {
  meditations: { blockType: 'meditations-index', filterField: 'meditationFilters' },
  pages: { blockType: 'pages-index', filterField: 'pageFilters' },
  songs: { blockType: 'songs-index', filterField: 'songFilters' },
}

/**
 * Convert old index block nodes to unified content-index block.
 * Returns true if any changes were made.
 */
export function convertToContentIndex(node: LexicalNode): boolean {
  let changed = false

  const processChildren = (children: LexicalNode[]) => {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]

      if (child.type === 'block' && child.fields?.blockType) {
        const mapping = BLOCK_TYPE_MAP[child.fields.blockType as string]
        if (mapping) {
          const filters = child.fields.filters
          child.fields.blockType = 'content-index'
          child.fields.type = mapping.type
          delete child.fields.filters
          child.fields[mapping.filterField] = filters
          changed = true
          continue
        }
      }

      if (child.children) {
        if (convertToContentIndex(child)) changed = true
      }
    }
  }

  if (node.root?.children) {
    processChildren(node.root.children)
  }
  if (node.children) {
    processChildren(node.children)
  }

  return changed
}

/**
 * Revert unified content-index blocks back to individual block types.
 * Returns true if any changes were made.
 */
export function revertFromContentIndex(node: LexicalNode): boolean {
  let changed = false

  const processChildren = (children: LexicalNode[]) => {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]

      if (
        child.type === 'block' &&
        child.fields?.blockType === 'content-index' &&
        typeof child.fields.type === 'string'
      ) {
        const mapping = TYPE_TO_BLOCK_MAP[child.fields.type]
        if (mapping) {
          const filters = child.fields[mapping.filterField]
          child.fields.blockType = mapping.blockType
          delete child.fields.type
          delete child.fields[mapping.filterField]
          child.fields.filters = filters
          changed = true
          continue
        }
      }

      if (child.children) {
        if (revertFromContentIndex(child)) changed = true
      }
    }
  }

  if (node.root?.children) {
    processChildren(node.root.children)
  }
  if (node.children) {
    processChildren(node.children)
  }

  return changed
}

async function migrateTable(
  db: MigrateUpArgs['db'],
  table: string,
  column: string,
  transform: (node: LexicalNode) => boolean,
): Promise<void> {
  const rows = await db.all<{ id: number; content: string }>(
    sql.raw(`SELECT "id", "${column}" FROM "${table}" WHERE "${column}" IS NOT NULL`),
  )

  for (const row of rows) {
    const id = row.id
    const contentStr = row.content
    if (!contentStr) continue

    try {
      const content = JSON.parse(contentStr) as LexicalNode
      if (transform(content)) {
        const updated = JSON.stringify(content)
        await db.run(
          sql.raw(`UPDATE "${table}" SET "${column}" = '${updated.replace(/'/g, "''")}' WHERE "id" = ${id}`),
        )
      }
    } catch {
      continue
    }
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await migrateTable(db, 'pages_locales', 'content', convertToContentIndex)
  await migrateTable(db, '_pages_v_locales', 'version_content', convertToContentIndex)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await migrateTable(db, 'pages_locales', 'content', revertFromContentIndex)
  await migrateTable(db, '_pages_v_locales', 'version_content', revertFromContentIndex)
}
