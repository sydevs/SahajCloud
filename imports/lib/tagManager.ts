/**
 * Tag Manager
 *
 * Manages import tags for tracking and cleanup
 */

import type { Logger } from './logger'
import type { Payload } from 'payload'

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
    tagCollection: string,
    tagName: string,
    additionalData: Record<string, any> = {},
  ): Promise<number> {
    // Check cache first
    const cacheKey = `${tagCollection}:${tagName}`
    if (this.tagCache.has(cacheKey)) {
      return this.tagCache.get(cacheKey)!
    }

    // Check if tag exists by title
    const existing = await this.payload.find({
      collection: tagCollection as any,
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
      collection: tagCollection as any,
      data: { title: tagName, ...additionalData },
    })

    const tagId = tag.id as number
    this.tagCache.set(cacheKey, tagId)
    await this.logger.info(`Created tag: ${tagName}`)
    return tagId
  }

  /**
   * Ensure image import tag (uses image-tags collection)
   */
  async ensureImageTag(importTag: string): Promise<number> {
    return this.ensureTag('image-tags', importTag)
  }

  /**
   * Add tags to an image document
   */
  async addTagsToImage(imageId: number, tagIds: number[]): Promise<void> {
    if (tagIds.length === 0) return

    try {
      // Get current image document
      const image = await this.payload.findByID({
        collection: 'images',
        id: imageId,
      })

      // Get current tags
      const currentTags = Array.isArray(image.tags)
        ? image.tags.map((tag: number | { id: number }) =>
            typeof tag === 'number' ? tag : tag.id,
          )
        : []

      // Find tags to add (not already present)
      const tagsToAdd = tagIds.filter((tagId) => !currentTags.includes(tagId))

      if (tagsToAdd.length > 0) {
        await this.payload.update({
          collection: 'images',
          id: imageId,
          data: {
            tags: [...currentTags, ...tagsToAdd],
          },
        })
        await this.logger.info(`Added ${tagsToAdd.length} tags to image ${imageId}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger.warn(`Failed to add tags to image ${imageId}: ${message}`)
    }
  }
}
