/**
 * Shared test helpers for creating Lexical content structures.
 * Used by schema-utils and cleanup-orphaned-media integration tests.
 */

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
 * Create Lexical content with GalleryBlock containing images
 * Note: GalleryBlock requires minRows: 3 images in actual usage
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
            blockType: 'gallery',
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
