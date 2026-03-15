import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Migration: Convert native Lexical blockquotes to QuoteBlock nodes
 *
 * The Storyblok seed previously created native Lexical blockquote nodes
 * (type: "quote" with paragraph children) for DD_Quote blocks instead of
 * using the custom QuoteBlock (type: "block", blockType: "quote").
 *
 * This migration converts those native blockquotes to structured QuoteBlock
 * nodes so the API returns separate text, credit, and caption fields.
 *
 * Affected table: lessons_locales (article column)
 */

interface LexicalNode {
  type: string
  version?: number
  children?: LexicalNode[]
  root?: { children?: LexicalNode[] }
  fields?: Record<string, unknown>
  text?: string
  format?: number
  detail?: number
  mode?: string
  style?: string
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

/**
 * Parse an attribution line like "— Author Name, Author Role" into parts.
 * Returns { credit, caption } where credit is the author name and caption is the role.
 */
function parseAttribution(text: string): { credit: string; caption: string } {
  // Strip the em-dash prefix
  const cleaned = text.replace(/^—\s*/, '')

  // Split on first comma to separate author from role
  const commaIndex = cleaned.indexOf(',')
  if (commaIndex === -1) {
    return { credit: cleaned.trim(), caption: '' }
  }

  return {
    credit: cleaned.substring(0, commaIndex).trim(),
    caption: cleaned.substring(commaIndex + 1).trim(),
  }
}

/**
 * Extract text content from a paragraph node's children.
 */
function extractParagraphText(node: LexicalNode): string {
  if (!node.children) return ''
  return node.children
    .filter((child) => child.type === 'text' && child.text)
    .map((child) => child.text!)
    .join('')
}

/**
 * Check if a paragraph node is an italic attribution (format: 2 = italic, text starts with "—").
 */
function isAttributionParagraph(node: LexicalNode): boolean {
  if (node.type !== 'paragraph' || !node.children?.length) return false
  const firstText = node.children.find((c) => c.type === 'text')
  return firstText?.format === 2 && (firstText.text?.startsWith('—') ?? false)
}

/**
 * Recursively convert native blockquote nodes to QuoteBlock nodes.
 * Returns true if any changes were made.
 */
function convertBlockquotes(node: LexicalNode): boolean {
  let changed = false

  const processChildren = (children: LexicalNode[]) => {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]

      // Check for native blockquote with attribution pattern
      if (child.type === 'quote' && child.children?.length) {
        const lastChild = child.children[child.children.length - 1]

        if (isAttributionParagraph(lastChild)) {
          // Extract quote text from all non-attribution paragraphs
          const textParagraphs = child.children.slice(0, -1)
          const quoteText = textParagraphs.map(extractParagraphText).join('\n')

          // Parse attribution
          const attributionText = extractParagraphText(lastChild)
          const { credit, caption } = parseAttribution(attributionText)

          // Replace with QuoteBlock node
          children[i] = {
            type: 'block',
            version: 2,
            fields: {
              id: generateId(),
              blockName: 'Quote Box',
              blockType: 'quote',
              text: quoteText,
              credit,
              caption,
            },
          }
          changed = true
          continue
        }
      }

      // Recurse into children
      if (child.children) {
        if (convertBlockquotes(child)) changed = true
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
 * Reverse: convert QuoteBlock nodes back to native blockquotes.
 * Only converts blocks that look like they were migrated (have credit/caption).
 */
function revertBlockquotes(node: LexicalNode): boolean {
  let changed = false

  const processChildren = (children: LexicalNode[]) => {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]

      if (
        child.type === 'block' &&
        child.fields?.blockType === 'quote' &&
        typeof child.fields.credit === 'string' &&
        child.fields.credit
      ) {
        const text = (child.fields.text as string) || ''
        const credit = child.fields.credit as string
        const caption = (child.fields.caption as string) || ''
        const attribution = caption ? `— ${credit}, ${caption}` : `— ${credit}`

        children[i] = {
          type: 'quote',
          version: 1,
          children: [
            {
              type: 'paragraph',
              version: 1,
              children: [
                { type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' },
              ],
            },
            {
              type: 'paragraph',
              version: 1,
              children: [
                {
                  type: 'text',
                  version: 1,
                  text: attribution,
                  format: 2,
                  detail: 0,
                  mode: 'normal',
                  style: '',
                },
              ],
            },
          ],
        }
        changed = true
        continue
      }

      if (child.children) {
        if (revertBlockquotes(child)) changed = true
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

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Process lessons_locales.article
  const rows = await db.run(
    sql`SELECT \`id\`, \`article\` FROM \`lessons_locales\` WHERE \`article\` IS NOT NULL`,
  )

  for (const row of rows.rows) {
    const id = row.id
    const articleStr = row.article as string
    if (!articleStr) continue

    try {
      const article = JSON.parse(articleStr) as LexicalNode
      if (convertBlockquotes(article)) {
        const updated = JSON.stringify(article)
        await db.run(sql`UPDATE \`lessons_locales\` SET \`article\` = ${updated} WHERE \`id\` = ${id}`)
      }
    } catch {
      // Skip rows with invalid JSON
      continue
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Revert lessons_locales.article
  const rows = await db.run(
    sql`SELECT \`id\`, \`article\` FROM \`lessons_locales\` WHERE \`article\` IS NOT NULL`,
  )

  for (const row of rows.rows) {
    const id = row.id
    const articleStr = row.article as string
    if (!articleStr) continue

    try {
      const article = JSON.parse(articleStr) as LexicalNode
      if (revertBlockquotes(article)) {
        const updated = JSON.stringify(article)
        await db.run(sql`UPDATE \`lessons_locales\` SET \`article\` = ${updated} WHERE \`id\` = ${id}`)
      }
    } catch {
      continue
    }
  }
}
