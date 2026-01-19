/**
 * Payload Helpers
 *
 * Common Payload CMS operations and utilities
 */

import type { Logger } from './logger'
import type { CollectionSlug, Payload } from 'payload'

export class PayloadHelpers {
  private payload: Payload
  private logger: Logger

  constructor(payload: Payload, logger: Logger) {
    this.payload = payload
    this.logger = logger
  }

  /**
   * Reset collection by deleting documents matching a filter
   */
  async resetCollection(
    collection: CollectionSlug,
    where?: Record<string, any>,
    limit = 1000,
  ): Promise<number> {
    await this.logger.info(`Resetting collection: ${collection}`)

    const result = await this.payload.find({
      collection,
      where,
      limit,
    })

    for (const doc of result.docs) {
      await this.payload.delete({
        collection,
        id: doc.id,
      })
    }

    await this.logger.info(`Deleted ${result.docs.length} documents from ${collection}`)
    return result.docs.length
  }

  /**
   * Reset collection by import tag
   */
  async resetCollectionByTag(
    collection: CollectionSlug,
    tagFieldName: string,
    tagId: string,
  ): Promise<number> {
    return this.resetCollection(collection, {
      [tagFieldName]: { contains: tagId },
    })
  }

  /**
   * Create document with error handling
   */
  async createDocument(
    collection: CollectionSlug,
    data: Record<string, any>,
    file?: {
      data: Buffer
      name: string
      size: number
      mimetype: string
    },
  ): Promise<string | null> {
    try {
      const doc = await this.payload.create({
        collection,
        data,
        file,
      })
      return String(doc.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger.error(`Failed to create ${collection} document: ${message}`)
      return null
    }
  }

  /**
   * Update document with error handling
   */
  async updateDocument(
    collection: CollectionSlug,
    id: string,
    data: Record<string, any>,
    file?: {
      data: Buffer
      name: string
      size: number
      mimetype: string
    },
  ): Promise<boolean> {
    try {
      await this.payload.update({
        collection,
        id,
        data,
        file,
      })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.logger.error(`Failed to update ${collection} document ${id}: ${message}`)
      return false
    }
  }

  /**
   * Find or create document
   */
  async findOrCreate(
    collection: CollectionSlug,
    where: Record<string, any>,
    data: Record<string, any>,
  ): Promise<string> {
    const existing = await this.payload.find({
      collection,
      where,
      limit: 1,
    })

    if (existing.docs.length > 0) {
      return String(existing.docs[0].id)
    }

    const created = await this.payload.create({
      collection,
      data,
    })

    return String(created.id)
  }
}
