/**
 * Lexical Converter
 *
 * Converts EditorJS-like content blocks to Payload CMS Lexical editor format
 */

import type { Payload } from 'payload'
import type { Logger } from './logger'

// ============================================================================
// TYPES
// ============================================================================

export interface ConversionContext {
  payload: Payload
  logger: Logger
  pageId: number
  pageTitle: string // For better error messages
  locale: string
  // ID maps for relationships
  mediaMap: Map<string, string> // image URL → Media ID
  formMap: Map<string, string> // form type → Form ID
  externalVideoMap: Map<string, string> // vimeo_id → ExternalVideo ID
  treatmentMap: Map<number, string> // treatment ID → Page ID
  treatmentThumbnailMap: Map<number, string> // treatment ID → Media ID (for thumbnails)
  meditationTitleMap: Map<string, string> // meditation title → Meditation ID
  meditationRailsTitleMap: Map<number, string> // Rails meditation ID → title (without duration)
}

// ============================================================================
// MEDITATION TITLE MAPPING
// ============================================================================
// Hard-coded mapping from Rails meditation titles to PayloadCMS meditation titles
// This handles cases where titles don't match exactly between the two systems
const RAILS_TO_PAYLOAD_MEDITATION_TITLES: Record<string, string> = {
  'your first meditation': 'first meditation',
  'experience joy': 'feel inner joy',
  'feel joyful': 'feel joy',
  'silence your mind': 'feel the silence within',
  'relax yourself': 'feel calm',
  'boost your confidence': 'feel self-esteem',
  'feel creative': 'be creative',
  'nourish your creativity': 'be creative',
  'feel more balanced': 'feel balanced',
  'experience inner harmony': 'feel harmony within',
}

export interface EditorJSContent {
  time?: number
  blocks: EditorJSBlock[]
  version?: string
}

export interface EditorJSBlock {
  id?: string
  type: string
  data: any
}

export interface LexicalRoot {
  root: {
    children: LexicalNode[]
    direction: null
    format: string
    indent: number
    type: 'root'
    version: number
  }
}

export interface LexicalNode {
  type: string
  version: number
  [key: string]: any
}

// ============================================================================
// HTML TO LEXICAL TEXT CONVERSION
// ============================================================================

interface TextFormat {
  bold: boolean
  italic: boolean
}

interface TextSegment {
  text: string
  format: TextFormat
  url?: string
}

/**
 * Parse HTML string into text segments with formatting
 */
function parseHTMLToSegments(html: string): TextSegment[] {
  if (!html) return []

  const segments: TextSegment[] = []
  let currentText = ''
  // eslint-disable-next-line prefer-const
  let currentFormat: TextFormat = { bold: false, italic: false }
  let currentUrl: string | undefined

  // Simple HTML parser using regex
  // This handles <b>, <i>, <a> tags
  const tagRegex = /<(\/?)(b|i|a|strong|em)([^>]*)>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(html)) !== null) {
    // Add text before tag
    if (match.index > lastIndex) {
      const textBefore = html.substring(lastIndex, match.index)
      if (textBefore) {
        currentText += textBefore
      }
    }

    const isClosing = match[1] === '/'
    const tagName = match[2].toLowerCase()
    const attributes = match[3]

    if (!isClosing) {
      // Opening tag - flush current segment if format changes
      if (currentText) {
        segments.push({
          text: currentText,
          format: { ...currentFormat },
          url: currentUrl,
        })
        currentText = ''
      }

      // Update format
      if (tagName === 'b' || tagName === 'strong') {
        currentFormat.bold = true
      } else if (tagName === 'i' || tagName === 'em') {
        currentFormat.italic = true
      } else if (tagName === 'a') {
        // Extract href
        const hrefMatch = attributes.match(/href=["']([^"']+)["']/i)
        if (hrefMatch && hrefMatch[1] && hrefMatch[1].trim()) {
          let url = hrefMatch[1].trim()
          // Decode HTML entities in URL
          url = url
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
          // Only set URL if it's not just a hash anchor or empty
          if (url !== '#' && url !== '') {
            currentUrl = url
          } else {
            // Explicitly set to undefined if href is invalid
            currentUrl = undefined
          }
        } else {
          // No href attribute or invalid - set to undefined
          currentUrl = undefined
        }
      }
    } else {
      // Closing tag - flush current segment
      if (currentText) {
        segments.push({
          text: currentText,
          format: { ...currentFormat },
          url: currentUrl,
        })
        currentText = ''
      }

      // Reset format
      if (tagName === 'b' || tagName === 'strong') {
        currentFormat.bold = false
      } else if (tagName === 'i' || tagName === 'em') {
        currentFormat.italic = false
      } else if (tagName === 'a') {
        currentUrl = undefined
      }
    }

    lastIndex = tagRegex.lastIndex
  }

  // Add remaining text
  if (lastIndex < html.length) {
    currentText += html.substring(lastIndex)
  }
  if (currentText) {
    segments.push({
      text: currentText,
      format: { ...currentFormat },
      url: currentUrl,
    })
  }

  return segments
}

/**
 * Strip all HTML tags from string
 */
function stripHTML(html: string): string {
  if (!html) return ''
  // Ensure the input is a string, even if it's accidentally something else
  const htmlString = String(html)
  return htmlString.replace(/<[^>]*>/g, '')
}

/**
 * Convert HTML string to Lexical text nodes
 */
export function htmlToLexicalText(html: string): LexicalNode[] {
  if (!html) return []

  const segments = parseHTMLToSegments(html)
  const nodes: LexicalNode[] = []

  for (const segment of segments) {
    const text = stripHTML(segment.text)
    if (!text) continue

    // Ensure text is explicitly a string
    const textString = String(text)

    // Only create link node if URL is valid
    // Filter out mailto:, tel:, javascript:, and other protocol links that Payload may not support
    // Payload accepts: http://, https://, / (relative paths)
    const url = segment.url?.trim()
    const isValidLink =
      url &&
      url.length > 0 &&
      url !== '#' &&
      url !== '' &&
      !url.startsWith('mailto:') &&
      !url.startsWith('tel:') &&
      !url.startsWith('javascript:') &&
      !/^\s+$/.test(url) && // Not whitespace-only
      // Ensure URL is properly formed (starts with http://, https://, /, or is a valid relative path)
      (/^https?:\/\//i.test(url) || url.startsWith('/') || /^[a-zA-Z0-9]/.test(url))

    if (isValidLink) {
      // Ensure URL is not undefined (add extra safety check)
      if (!url || url.trim() === '') {
        // Fallback to text node if URL is somehow invalid
        nodes.push({
          type: 'text',
          version: 1,
          text: textString,
          format: getTextFormat(segment.format),
          style: '',
          mode: 'normal',
          detail: 0,
        })
      } else {
        // Link node - Payload uses a different structure with fields wrapper
        nodes.push({
          type: 'link',
          version: 3,
          fields: {
            linkType: 'custom',
            url: url.trim(),
            newTab: false,
          },
          direction: null,
          format: '',
          indent: 0,
          children: [
            {
              type: 'text',
              version: 1,
              text: textString,
              format: getTextFormat(segment.format),
              style: '',
              mode: 'normal',
              detail: 0,
            },
          ],
        })
      }
    } else {
      // Regular text node (for mailto:, tel:, invalid, or empty URLs)
      nodes.push({
        type: 'text',
        version: 1,
        text: textString,
        format: getTextFormat(segment.format),
        style: '',
        mode: 'normal',
        detail: 0,
      })
    }
  }

  return nodes
}

/**
 * Convert text format to Lexical format number
 * 0 = normal, 1 = bold, 2 = italic, 3 = bold+italic
 */
function getTextFormat(format: TextFormat): number {
  let formatNum = 0
  if (format.bold) formatNum += 1
  if (format.italic) formatNum += 2
  return formatNum
}

// ============================================================================
// LEXICAL NODE CREATORS
// ============================================================================

/**
 * Create a Lexical paragraph node
 */
export function createParagraphNode(text: string): LexicalNode {
  return {
    type: 'paragraph',
    version: 1,
    children: htmlToLexicalText(text),
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
  }
}

/**
 * Create a Lexical heading node
 */
export function createHeadingNode(text: string, tag: 'h1' | 'h2' | 'h3'): LexicalNode {
  return {
    type: 'heading',
    version: 1,
    tag,
    children: htmlToLexicalText(text),
    direction: null,
    format: '',
    indent: 0,
  }
}

/**
 * Create a Lexical block node (for Payload blocks)
 */
export function createBlockNode(blockType: string, blockName: string, fields: any): LexicalNode {
  return {
    type: 'block',
    version: 2,
    fields: {
      id: generateId(),
      blockName,
      blockType,
      ...fields,
    },
  }
}

/**
 * Create a Lexical relationship node
 */
export function createRelationshipNode(relationTo: string, value: string): LexicalNode {
  return {
    type: 'relationship',
    version: 2,
    relationTo,
    value,
  }
}

/**
 * Create a Lexical upload node (inline image)
 */
export function createUploadNode(
  mediaId: string,
  align: 'center' | 'left' | 'right' | 'wide',
  caption?: string,
): LexicalNode {
  return {
    type: 'upload',
    version: 1,
    relationTo: 'media',
    value: mediaId,
    fields: {
      align,
      ...(caption ? { caption } : {}),
    },
  }
}

/**
 * Determine align value based on position and size
 * Mapping:
 * - position: left = align: left
 * - position: right = align: right
 * - position: full-width + size: normal = align: center
 * - position: full-width + size: wide = align: wide
 * - default = center
 */
export function determineAlign(
  position?: string,
  size?: string,
): 'center' | 'left' | 'right' | 'wide' {
  if (position === 'left') return 'left'
  if (position === 'right') return 'right'
  if (position === 'full-width' || position === 'full_width' || position === 'fullwidth') {
    if (size === 'wide') return 'wide'
    return 'center'
  }
  // Default to center if no position/size specified
  return 'center'
}

/**
 * Generate a unique ID for blocks
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

// ============================================================================
// EDITORJS BLOCK CONVERTERS
// ============================================================================

/**
 * Convert EditorJS paragraph block to Lexical
 */
export function convertParagraph(block: EditorJSBlock): LexicalNode {
  const { data } = block
  const text = data.text || ''

  // Check if it's a header (only blocks with type: 'header' should become headings)
  if (data.type === 'header') {
    const level = data.level === 'h1' ? 'h1' : data.level === 'h3' ? 'h3' : 'h2'
    return createHeadingNode(text, level)
  }

  // Regular paragraph
  return createParagraphNode(text)
}

/**
 * Convert EditorJS textbox block to TextBoxBlock or QuoteBlock
 */
export function convertTextbox(
  block: EditorJSBlock,
  context: ConversionContext,
): LexicalNode | null {
  const { data } = block

  // Check if it's a quote (type: text or hero)
  if (data.type === 'text' || data.type === 'hero') {
    const text = stripHTML(data.text || '').trim()
    // Quote block requires text field - skip if empty
    if (!text) {
      context.logger.skip(
        `QuoteBlock (missing required text field) for page "${context.pageTitle}" (Rails ID ${context.pageId}). Original data: ${JSON.stringify(data)}`,
      )
      return null
    }

    const title = stripHTML(data.title || '').trim()
    return createBlockNode('quote', 'Quote', {
      title: title || undefined,
      text: text,
      credit: stripHTML(data.credit || ''),
      caption: stripHTML(data.subtitle || ''),
    })
  }

  // TextBoxBlock - get image relationship (REQUIRED)
  let imageId: string | undefined
  if (data.image?.preview) {
    // Look up in media map by preview URL (same as LayoutBlock and MediaBlock)
    imageId = context.mediaMap.get(data.image.preview)
  }

  // Image is required - skip if missing
  if (!imageId) {
    context.logger.skip(
      `TextBoxBlock (missing required image field) for page "${context.pageTitle}" (Rails ID ${context.pageId}). Original data: ${JSON.stringify(data)}`,
    )
    return null
  }

  // Determine imagePosition and textPosition based on old style
  let imagePosition: 'left' | 'right' | 'overlay' = 'left'
  let textPosition: 'left' | 'right' | 'center' = 'right'
  let textColor: 'dark' | 'light' = 'dark'

  if (data.type === 'splash') {
    imagePosition = 'overlay'
    textPosition = 'left'
    // Splash usually has light text on background
    textColor = data.color === 'dark' ? 'light' : 'light'
  } else if (data.type === 'image') {
    if (data.background === 'image') {
      imagePosition = 'overlay'
      textPosition = 'left'
      // Determine text color based on old 'color' field
      textColor = data.color === 'dark' ? 'light' : 'dark'
    } else {
      if (data.position === 'right') {
        imagePosition = 'right'
        textPosition = 'left'
      } else {
        imagePosition = 'left'
        textPosition = 'right'
      }
      // Non-overlay has dark text by default
      textColor = 'dark'
    }
  }

  // Determine wisdomStyle (true if background=ornate)
  const wisdomStyle = data.background === 'ornate'

  // Build TextBoxBlock fields
  const fields: any = {
    image: imageId,
    imagePosition,
    textPosition,
    textColor,
    wisdomStyle,
  }

  // Only include title if non-empty
  const title = stripHTML(data.title || '').trim()
  if (title) {
    fields.title = title
  }

  // Only include subtitle if non-empty
  const subtitle = stripHTML(data.subtitle || '').trim()
  if (subtitle) {
    fields.subtitle = subtitle
  }

  // Text field is now a simple textarea - only include if non-empty
  const textContent = stripHTML(data.text || '').trim()
  if (textContent) {
    fields.text = textContent
  }

  // Map button fields
  const buttonUrl = (data.url || '').trim()
  if (buttonUrl && buttonUrl !== '#' && buttonUrl !== '') {
    fields.buttonUrl = buttonUrl
    const buttonText = stripHTML(data.action || '').trim()
    if (buttonText) {
      fields.buttonText = buttonText
    }
  }

  // Add import metadata
  fields.importData = {
    background: data.background,
    color: data.color,
    position: data.position,
    spacing: data.spacing,
    decorations: data.decorations,
  }

  return createBlockNode('textbox', 'Text Box', fields)
}

/**
 * Convert EditorJS layout block to LayoutBlock
 */
export function convertLayout(
  block: EditorJSBlock,
  context: ConversionContext,
): LexicalNode | null {
  const { data } = block

  // Return null if no items - will be filtered out by caller
  if (!data.items || data.items.length === 0) {
    return null
  }

  // Map style
  const styleMap: Record<string, string> = {
    columns: 'columns',
    accordion: 'accordion',
    grid: 'grid',
  }
  const style = styleMap[data.type] || 'columns'

  // Convert items - skip items without required title or titleUrl
  const items = (data.items || [])
    .map((item: any, index: number) => {
      let imageId: string | undefined
      if (item.image?.preview) {
        // Look up in media map by preview URL
        imageId = context.mediaMap.get(item.image.preview)
      }

      const title = stripHTML(item.title || '').trim()
      const text = stripHTML(item.text || '').trim()
      const titleUrl = (item.url || '').trim()

      const convertedItem: any = {
        title: title,
        titleUrl: titleUrl,
        text: text || '', // Plain string for textarea
        id: generateId(),
      }

      if (imageId) {
        convertedItem.image = imageId
      }

      return convertedItem
    })
    .filter((item: any) => item !== null) // Remove null items

  // Return null if all items were filtered out
  if (items.length === 0) {
    return null
  }

  return createBlockNode('layout', 'Layout', {
    style,
    items,
  })
}

/**
 * Convert EditorJS media block to GalleryBlock (Image Gallery)
 * Note: GalleryBlock has minRows:3, maxRows:15 and only supports media collection
 * Returns null for <3 items (caller should handle individual upload nodes if needed)
 */
export function convertMedia(block: EditorJSBlock, context: ConversionContext): LexicalNode | null {
  const { data } = block

  // Collect Media IDs as plain strings (upload field format)
  const items: string[] = []
  for (const item of data.items || []) {
    if (item.image?.preview) {
      const mediaId = context.mediaMap.get(item.image.preview)
      if (mediaId) {
        items.push(mediaId)
      }
    }
  }

  // GalleryBlock requires minimum 3 items
  // If <3 items, return null and let caller convert to individual upload nodes
  // (no skip log needed since we're converting, not skipping)
  if (items.length < 3) {
    return null
  }

  // Note: title field was removed from GalleryBlock
  // If source data has a title, it should be added as a heading node by the caller
  return createBlockNode('gallery', 'Image Gallery', {
    items: items,
  })
}

/**
 * Convert media block items to individual upload nodes (for <3 items)
 */
export function convertMediaToUploadNodes(
  block: EditorJSBlock,
  context: ConversionContext,
): LexicalNode[] {
  const { data } = block
  const nodes: LexicalNode[] = []

  for (const item of data.items || []) {
    if (item.image?.preview) {
      const mediaId = context.mediaMap.get(item.image.preview)
      if (mediaId) {
        // Create upload node with center alignment
        nodes.push(createUploadNode(mediaId, 'center'))
      }
    }
  }

  return nodes
}

/**
 * Convert EditorJS action block to Form relationship or ButtonBlock
 */
export function convertAction(
  block: EditorJSBlock,
  context: ConversionContext,
): LexicalNode | null {
  const { data } = block

  // Check if it's a form
  if (data.form) {
    const formId = context.formMap.get(data.form)
    if (formId) {
      return createRelationshipNode('forms', formId)
    }
    // Fall through to button if form not found
  }

  // Button block requires both text and url
  const text = stripHTML(data.action || data.text || '').trim()
  const url = (data.url || '').trim()

  if (!text || !url) {
    context.logger.skip(
      `ButtonBlock (missing required ${!text ? 'text' : 'url'} field) for page "${context.pageTitle}" (Rails ID ${context.pageId}). Original data: ${JSON.stringify(data)}`,
    )
    return null
  }

  return createBlockNode('button', 'Button', {
    text,
    url,
  })
}

/**
 * Convert EditorJS vimeo block to ExternalVideo relationship
 */
export function convertVimeo(block: EditorJSBlock, context: ConversionContext): LexicalNode | null {
  const { data } = block

  if (!data.vimeo_id && !data.youtube_id) {
    return null
  }

  const videoId = data.vimeo_id || data.youtube_id
  const externalVideoId = context.externalVideoMap.get(videoId)

  if (!externalVideoId) {
    context.logger.warn(`ExternalVideo not found for ${videoId}`)
    return null
  }

  return createRelationshipNode('external-videos', externalVideoId)
}

/**
 * Convert EditorJS catalog block to relationship(s) or GalleryBlock
 */
export async function convertCatalog(
  block: EditorJSBlock,
  context: ConversionContext,
): Promise<LexicalNode | null> {
  const { data } = block

  if (!data.items || data.items.length === 0) {
    return null
  }

  const type = data.type // 'treatments' or 'meditations'
  const itemIds: string[] = []

  // Map items to Page/Meditation IDs
  for (const itemId of data.items) {
    if (type === 'treatments') {
      const pageId = context.treatmentMap.get(itemId)
      if (pageId) {
        itemIds.push(pageId)
      } else {
        await context.logger.warn(
          `Treatment ${itemId} not found in catalog block for page "${context.pageTitle}" (Rails ID ${context.pageId})`,
        )
      }
    } else if (type === 'meditations') {
      // Two-step lookup: Rails ID → title → Payload ID
      // Convert itemId to number if it's a string (JSON may have numbers as strings)
      const numericItemId = typeof itemId === 'string' ? parseInt(itemId) : itemId

      const railsTitle = context.meditationRailsTitleMap.get(numericItemId)

      if (railsTitle) {
        // Try direct lookup first
        let meditationId = context.meditationTitleMap.get(railsTitle)

        // If not found, try using hard-coded mapping
        if (!meditationId) {
          const mappedTitle = RAILS_TO_PAYLOAD_MEDITATION_TITLES[railsTitle]
          if (mappedTitle) {
            meditationId = context.meditationTitleMap.get(mappedTitle)
          }
        }

        if (meditationId) {
          itemIds.push(meditationId)
        } else {
          await context.logger.warn(
            `Meditation title "${railsTitle}" (Rails ID ${numericItemId}) not found in Payload for page "${context.pageTitle}" (Rails ID ${context.pageId})`,
          )
        }
      } else {
        await context.logger.warn(
          `Meditation Rails ID ${numericItemId} not found in PostgreSQL database for page "${context.pageTitle}" (Rails ID ${context.pageId})`,
        )
      }
    }
  }

  if (itemIds.length === 0) {
    return null
  }

  // Single item - direct relationship
  if (itemIds.length === 1) {
    const relationTo = type === 'treatments' ? 'pages' : 'meditations'
    return createRelationshipNode(relationTo, itemIds[0])
  }

  // CatalogBlock requires minimum 3 items (minRows: 3)
  // If <3 items, return null and let caller convert to individual relationship nodes
  // (no skip log needed since we're converting, not skipping)
  if (itemIds.length < 3) {
    return null
  }

  // Multiple items - CatalogBlock (supports meditations and pages)
  const relationTo = type === 'treatments' ? 'pages' : 'meditations'
  const items = itemIds.map((id) => ({
    relationTo: relationTo,
    value: id,
  }))

  return createBlockNode('catalog', 'Catalog', {
    items: items,
  })
}

/**
 * Convert catalog block items to individual relationship nodes (for 2 items)
 */
export async function convertCatalogToRelationshipNodes(
  block: EditorJSBlock,
  context: ConversionContext,
): Promise<LexicalNode[]> {
  const { data } = block
  const nodes: LexicalNode[] = []

  if (!data.items || data.items.length === 0) {
    return nodes
  }

  const type = data.type // 'treatments' or 'meditations'
  const relationTo = type === 'treatments' ? 'pages' : 'meditations'

  // Map items to Page/Meditation IDs (same logic as convertCatalog)
  for (const itemId of data.items) {
    let payloadId: string | undefined

    if (type === 'treatments') {
      payloadId = context.treatmentMap.get(itemId)
      if (!payloadId) {
        await context.logger.warn(
          `Treatment ${itemId} not found in catalog block for page "${context.pageTitle}" (Rails ID ${context.pageId})`,
        )
      }
    } else if (type === 'meditations') {
      // Two-step lookup: Rails ID → title → Payload ID
      const numericItemId = typeof itemId === 'string' ? parseInt(itemId) : itemId
      const railsTitle = context.meditationRailsTitleMap.get(numericItemId)

      if (railsTitle) {
        // Try direct lookup first
        let meditationId = context.meditationTitleMap.get(railsTitle)

        // If not found, try using hard-coded mapping
        if (!meditationId) {
          const mappedTitle = RAILS_TO_PAYLOAD_MEDITATION_TITLES[railsTitle]
          if (mappedTitle) {
            meditationId = context.meditationTitleMap.get(mappedTitle)
          }
        }

        payloadId = meditationId
      }
    }

    if (payloadId) {
      nodes.push(createRelationshipNode(relationTo, payloadId))
    }
  }

  return nodes
}

/**
 * Convert EditorJS quote block to QuoteBlock
 * Quote block structure:
 * {
 *   "type": "quote",
 *   "data": {
 *     "text": "...",
 *     "credit": "",
 *     "caption": "",
 *     "position": "narrow"
 *   }
 * }
 */
export function convertQuoteBlock(block: EditorJSBlock): LexicalNode | null {
  const { data } = block
  const text = stripHTML(data.text || '').trim()

  // Quote block requires text field - skip if empty
  if (!text) {
    return null
  }

  const title = stripHTML(data.title || '').trim()
  return createBlockNode('quote', 'Quote', {
    title: title || undefined,
    text: text,
    credit: stripHTML(data.credit || ''),
    caption: stripHTML(data.caption || ''),
  })
}

/**
 * Convert EditorJS header block to heading node
 * Header block structure:
 * {
 *   "type": "header",
 *   "data": {
 *     "text": "...",
 *     "level": "h2",
 *     "centered": false
 *   }
 * }
 */
export function convertHeaderBlock(block: EditorJSBlock): LexicalNode | null {
  const { data } = block
  const text = stripHTML(data.text || '').trim()

  // Skip empty headers
  if (!text) {
    return null
  }

  // Map level to heading tag (default to h2)
  let tag: 'h1' | 'h2' | 'h3' = 'h2'
  if (data.level === 'h1') {
    tag = 'h1'
  } else if (data.level === 'h3') {
    tag = 'h3'
  }

  return createHeadingNode(text, tag)
}

// ============================================================================
// MAIN CONVERSION FUNCTION
// ============================================================================

/**
 * Convert EditorJS content to Lexical format
 */
export async function convertEditorJSToLexical(
  content: EditorJSContent | null,
  context: ConversionContext,
): Promise<LexicalRoot> {
  const children: LexicalNode[] = []

  if (!content || !content.blocks) {
    // Return valid empty Lexical structure with at least one paragraph node
    // Lexical requires root to always have at least one child
    return {
      root: {
        children: [
          {
            children: [],
            direction: null,
            format: '',
            indent: 0,
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }
  }

  for (let i = 0; i < content.blocks.length; i++) {
    const block = content.blocks[i]

    try {
      let node: LexicalNode | null = null

      switch (block.type) {
        case 'paragraph':
          node = convertParagraph(block)
          break

        case 'textbox':
          node = convertTextbox(block, context)
          break

        case 'layout':
          node = convertLayout(block, context)
          break

        case 'media': {
          // GalleryBlock no longer has title field - add heading if title exists
          const title = stripHTML(block.data?.title || '').trim()
          if (title) {
            children.push(createHeadingNode(title, 'h2'))
          }

          // convertMedia returns null for <3 items, handle individually
          const result = convertMedia(block, context)
          if (result === null) {
            // Create individual upload nodes for 1-2 items
            const mediaNodes = convertMediaToUploadNodes(block, context)
            if (mediaNodes.length > 0) {
              children.push(...mediaNodes)
            }
          } else {
            node = result
          }
          break
        }

        case 'action':
          node = convertAction(block, context)
          break

        case 'vimeo':
          node = convertVimeo(block, context)
          break

        case 'catalog': {
          // CatalogBlock doesn't have title field - add heading if title exists
          const title = stripHTML(block.data?.title || '').trim()
          if (title) {
            children.push(createHeadingNode(title, 'h2'))
          }

          // convertCatalog returns null for <3 items, handle individually
          const result = await convertCatalog(block, context)
          if (result === null) {
            // Create individual relationship nodes for 1-2 items
            const catalogNodes = await convertCatalogToRelationshipNodes(block, context)
            if (catalogNodes.length > 0) {
              children.push(...catalogNodes)
            }
          } else {
            node = result
          }
          break
        }

        case 'whitespace':
          // Skip whitespace blocks
          continue

        case 'list':
          // Skip list blocks (table of contents)
          continue

        case 'quote':
          // Convert quote block to QuoteBlock
          node = convertQuoteBlock(block)
          break

        case 'header':
          // Convert header block to heading node
          node = convertHeaderBlock(block)
          break

        default:
          await context.logger.warn(
            `Unknown block type '${block.type}' at index ${i} for page "${context.pageTitle}" (Rails ID ${context.pageId})`,
          )
          continue
      }

      if (node) {
        children.push(node)
      }
    } catch (error: any) {
      // Fail the entire import on block conversion error
      throw new Error(
        `Failed to convert block type '${block.type}' at index ${i} for page ${context.pageId}: ${error.message}`,
      )
    }
  }

  // Ensure root always has at least one child (Lexical requirement)
  // If all blocks failed to convert or no valid blocks, add empty paragraph
  if (children.length === 0) {
    children.push({
      children: [],
      direction: null,
      format: '',
      indent: 0,
      type: 'paragraph',
      version: 1,
    })
  }

  return {
    root: {
      children,
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}
