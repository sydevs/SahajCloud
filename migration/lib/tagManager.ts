/**
 * Tag Manager
 *
 * Manages import tags for tracking and cleanup
 */

import type { Payload } from 'payload'
import type { Logger } from './logger'

export class TagManager {
  private payload: Payload
  private logger: Logger
  private tagCache: Map<string, string> = new Map()

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
  ): Promise<string> {
    // Check cache first
    const cacheKey = `${tagCollection}:${tagName}`
    if (this.tagCache.has(cacheKey)) {
      return this.tagCache.get(cacheKey)!
    }

    // Check if tag exists
    const existing = await this.payload.find({
      collection: tagCollection as any,
      where: { name: { equals: tagName } },
      limit: 1,
    })

    if (existing.docs.length > 0) {
      const tagId = existing.docs[0].id as string
      this.tagCache.set(cacheKey, tagId)
      await this.logger.info(`Found existing tag: ${tagName}`)
      return tagId
    }

    // Create tag
    const tag = await this.payload.create({
      collection: tagCollection as any,
      data: { name: tagName, ...additionalData },
    })

    const tagId = tag.id as string
    this.tagCache.set(cacheKey, tagId)
    await this.logger.info(`Created tag: ${tagName}`)
    return tagId
  }

  /**
   * Ensure media import tag
   */
  async ensureMediaTag(importTag: string): Promise<string> {
    return this.ensureTag('media-tags', importTag)
  }

  /**
   * Add tags to media document
   */
  async addTagsToMedia(mediaId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return

    try {
      // Get current media document
      const media = await this.payload.findByID({
        collection: 'media',
        id: mediaId,
      })

      // Get current tags
      const currentTags = Array.isArray(media.tags)
        ? media.tags.map((tag: string | { id: string }) =>
            typeof tag === 'string' ? tag : tag.id,
          )
        : []

      // Find tags to add (not already present)
      const tagsToAdd = tagIds.filter((tagId) => !currentTags.includes(tagId))

      if (tagsToAdd.length > 0) {
        await this.payload.update({
          collection: 'media',
          id: mediaId,
          data: {
            tags: [...currentTags, ...tagsToAdd],
          },
        })
        await this.logger.info(`Added ${tagsToAdd.length} tags to media ${mediaId}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger.warn(`Failed to add tags to media ${mediaId}: ${message}`)
    }
  }
}
