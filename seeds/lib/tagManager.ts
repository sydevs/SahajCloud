/**
 * Tag Manager
 *
 * Manages import tags for tracking and cleanup
 */

import type { Logger } from './logger'
import type { CollectionSlug, Payload } from 'payload'

import type { Image } from '@/payload-types'

/** Image tag enum values (inline strings from Images collection) */
type ImageTagValue = NonNullable<NonNullable<Image['tags']>[number]>

export class TagManager {
  private payload: Payload
  private logger: Logger
  private tagCache: Map<string, number> = new Map()

  constructor(payload: Payload, logger: Logger) {
    this.payload = payload
    this.logger = logger
  }

  /**
   * Ensure import tag exists in a tag collection
   */
  async ensureTag(
    tagCollection: CollectionSlug,
    tagName: string,
    additionalData: Record<string, unknown> = {},
  ): Promise<number> {
    // Check cache first
    const cacheKey = `${tagCollection}:${tagName}`
    if (this.tagCache.has(cacheKey)) {
      return this.tagCache.get(cacheKey)!
    }

    // Check if tag exists by title
    const existing = await this.payload.find({
      collection: tagCollection,
      where: { title: { equals: tagName } },
      limit: 1,
    })

    if (existing.docs.length > 0) {
      const tagId = existing.docs[0].id as number
      this.tagCache.set(cacheKey, tagId)
      await this.logger.info(`Found existing tag: ${tagName}`)
      return tagId
    }

    // Create tag with title field
    const tag = await this.payload.create({
      collection: tagCollection,
      data: { title: tagName, ...additionalData },
    })

    const tagId = tag.id as number
    this.tagCache.set(cacheKey, tagId)
    await this.logger.info(`Created tag: ${tagName}`)
    return tagId
  }

  /**
   * Add string tags to an image document
   * Image tags are now inline enum select values, not relationships
   */
  async addTagsToImage(imageId: number, tags: string[]): Promise<void> {
    if (tags.length === 0) return

    try {
      // Get current image document
      const image = await this.payload.findByID({
        collection: 'images',
        id: imageId,
      })

      // Get current tags (now string array)
      const currentTags = Array.isArray(image.tags) ? (image.tags as string[]) : []

      // Merge tags (deduplicate)
      const mergedTags = Array.from(new Set([...currentTags, ...tags]))

      // Only update if there are new tags to add
      if (mergedTags.length > currentTags.length) {
        await this.payload.update({
          collection: 'images',
          id: imageId,
          data: {
            // Cast to ImageTagValue[] - seed scripts use valid enum values
            tags: mergedTags as ImageTagValue[],
          },
        })
        await this.logger.info(
          `Added ${mergedTags.length - currentTags.length} tags to image ${imageId}`,
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger.warn(`Failed to add tags to image ${imageId}: ${message}`)
    }
  }
}
