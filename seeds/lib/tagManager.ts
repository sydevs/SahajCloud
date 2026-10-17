/** Import tags, for tracking and cleanup. */

import type { Logger } from './logger'
import type { CollectionSlug, Payload } from 'payload'

import type { ImageTag } from '@/types/tags'

export class TagManager {
  private payload: Payload
  private logger: Logger
  private tagCache: Map<string, number> = new Map()

  constructor(payload: Payload, logger: Logger) {
    this.payload = payload
    this.logger = logger
  }

  async ensureTag(
    tagCollection: CollectionSlug,
    tagName: string,
    additionalData: Record<string, unknown> = {},
  ): Promise<number> {
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

    // The cast is what a `CollectionSlug`-typed variable costs: Payload derives
    // `data` from the slug, so with the whole union in play it demands the
    // required fields of *every* collection at once. This only type-checked
    // before because `forms` happened to require nothing but `title`, and it
    // stopped the moment `forms` gained a required `actionType` (#723). The
    // caller supplies the rest through `additionalData`, which no signature
    // here can relate to the slug it was passed.
    const tag = await this.payload.create({
      collection: tagCollection,
      data: { title: tagName, ...additionalData } as never,
    })

    const tagId = tag.id as number
    this.tagCache.set(cacheKey, tagId)
    await this.logger.info(`Created tag: ${tagName}`)
    return tagId
  }

  /** Image tags are inline enum select values, not relationships. */
  async addTagsToImage(imageId: number, tags: string[]): Promise<void> {
    if (tags.length === 0) return

    try {
      const image = await this.payload.findByID({
        collection: 'images',
        id: imageId,
      })

      const currentTags = Array.isArray(image.tags) ? (image.tags as string[]) : []

      const mergedTags = Array.from(new Set([...currentTags, ...tags]))

      if (mergedTags.length > currentTags.length) {
        await this.payload.update({
          collection: 'images',
          id: imageId,
          data: {
            // Cast to ImageTag[] - seed scripts use valid enum values
            tags: mergedTags as ImageTag[],
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
