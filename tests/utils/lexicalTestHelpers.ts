/**
 * Shared test helpers for creating Lexical content structures.
 * Used by schema-utils and cleanup-orphaned-media integration tests.
 */

import type { DetectedHeading } from '@/components/admin/TableOfContentsField'
import type { Page } from '@/payload-types'

/**
 * Generate unique ID for test entities
 */
export function uniqueId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(7)}`
}

/**
 * Create Lexical content with TextBoxBlock containing image
 * Structure based on createBlockNode in seeds/lib/lexicalConverter.ts:
 * - blockType goes INSIDE fields
 * - version: 2 for block nodes
 */
export function createLexicalWithTextBoxBlock(imageId: number): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'block',
          version: 2,
          fields: {
            id: uniqueId(),
            blockName: 'Text Box',
            blockType: 'textbox',
            image: imageId,
            imagePosition: 'left',
            text: 'Test content',
          },
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}

/**
 * Create Lexical content with LayoutBlock containing images in items
 * Structure based on createBlockNode in seeds/lib/lexicalConverter.ts
 */
export function createLexicalWithLayoutBlock(imageIds: number[]): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'block',
          version: 2,
          fields: {
            id: uniqueId(),
            blockName: 'Layout',
            blockType: 'layout',
            style: 'grid',
            items: imageIds.map((id) => ({
              id: uniqueId(),
              image: id,
              title: 'Test Item',
            })),
          },
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}

/**
 * Create Lexical content with QuoteBlock containing text, credit, and caption
 * Structure based on createBlockNode in seeds/lib/lexicalConverter.ts
 */
export function createLexicalWithQuoteBlock(options: {
  text: string
  title?: string
  credit?: string
  caption?: string
}): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'block',
          version: 2,
          fields: {
            id: uniqueId(),
            blockName: 'Quote Box',
            blockType: 'quote',
            text: options.text,
            ...(options.title ? { title: options.title } : {}),
            ...(options.credit ? { credit: options.credit } : {}),
            ...(options.caption ? { caption: options.caption } : {}),
          },
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}

/**
 * Create Lexical content with ImageGalleryBlock containing images
 * Note: ImageGalleryBlock requires minRows: 3 images in actual usage
 * Structure based on createBlockNode in seeds/lib/lexicalConverter.ts
 */
export function createLexicalWithGalleryBlock(imageIds: number[]): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'block',
          version: 2,
          fields: {
            id: uniqueId(),
            blockName: 'Image Gallery',
            blockType: 'image-gallery',
            items: imageIds,
          },
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}

/**
 * Create Lexical content with an Upload node referencing an image.
 * Structure mirrors what `@payloadcms/richtext-lexical`'s UploadFeature emits:
 * - `type: 'upload'`, `version: 3` for upload nodes
 * - `relationTo`: the upload-collection slug ('images' here)
 * - `value`: the related document ID
 * - `fields`: bag of UploadFeature custom fields (for example, caption, align)
 */
export function createLexicalWithUploadNode(
  imageId: number,
  fields: Record<string, unknown> = {},
): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'upload',
          version: 3,
          format: '',
          relationTo: 'images',
          value: imageId,
          fields,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}

/**
 * Create Lexical content with a relationship node.
 * Useful for regression tests around stale relationship collection slugs.
 */
export function createLexicalWithRelationshipNode(options: {
  relationTo: string
  value: unknown
}): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'relationship',
          version: 2,
          format: '',
          relationTo: options.relationTo,
          value: options.value,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}

/**
 * Create Lexical content with TableOfContentsBlock
 * Structure based on createBlockNode in seeds/lib/lexicalConverter.ts
 */
export function createLexicalWithTableOfContentsBlock(options: {
  title?: string
  headings?: DetectedHeading[] | null
}): Page['content'] {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'block',
          version: 2,
          fields: {
            id: uniqueId(),
            blockName: 'Table of Contents',
            blockType: 'table-of-contents',
            ...(options.title !== undefined ? { title: options.title } : {}),
            headings: options.headings !== undefined ? options.headings : null,
          },
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as Page['content']
}
