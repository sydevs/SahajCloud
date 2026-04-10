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

/**
 * Apply a Lexical content transform to every row in a table that has a content
 * column. Uses parameterized queries (no manual escaping) and reads the row via
 * the actual column name so both `pages_locales.content` and
 * `_pages_v_locales.version_content` are migrated correctly.
 */
async function transformPagesLocales(
  db: MigrateUpArgs['db'],
  transform: (node: LexicalNode) => boolean,
): Promise<void> {
  const rows = await db.all<{ id: number; content: string }>(
    sql`SELECT \`id\`, \`content\` FROM \`pages_locales\` WHERE \`content\` IS NOT NULL`,
  )

  for (const row of rows) {
    if (!row.content) continue
    try {
      const content = JSON.parse(row.content) as LexicalNode
      if (transform(content)) {
        const updated = JSON.stringify(content)
        await db.run(
          sql`UPDATE \`pages_locales\` SET \`content\` = ${updated} WHERE \`id\` = ${row.id}`,
        )
      }
    } catch {
      continue
    }
  }
}

async function transformPagesVersionLocales(
  db: MigrateUpArgs['db'],
  transform: (node: LexicalNode) => boolean,
): Promise<void> {
  const rows = await db.all<{ id: number; version_content: string }>(
    sql`SELECT \`id\`, \`version_content\` FROM \`_pages_v_locales\` WHERE \`version_content\` IS NOT NULL`,
  )

  for (const row of rows) {
    if (!row.version_content) continue
    try {
      const content = JSON.parse(row.version_content) as LexicalNode
      if (transform(content)) {
        const updated = JSON.stringify(content)
        await db.run(
          sql`UPDATE \`_pages_v_locales\` SET \`version_content\` = ${updated} WHERE \`id\` = ${row.id}`,
        )
      }
    } catch {
      continue
    }
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await transformPagesLocales(db, convertToContentIndex)
  await transformPagesVersionLocales(db, convertToContentIndex)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await transformPagesLocales(db, revertFromContentIndex)
  await transformPagesVersionLocales(db, revertFromContentIndex)
}
