#!/usr/bin/env tsx

/**
 * Check Database Statistics
 *
 * Shows the document counts in the test database using Payload API.
 * Works with both SQLite (test) and D1 (production) databases.
 */

import { getPayload } from 'payload'
import type { Payload } from 'payload'

import configPromise from '../../src/payload.config'

async function checkDatabaseStats() {
  let payload: Payload | null = null

  try {
    // Initialize Payload
    const config = await configPromise
    payload = await getPayload({ config })

    // Define collections to check
    const collections = [
      'managers',
      'clients',
      'media',
      'media-tags',
      'meditation-tags',
      'music-tags',
      'page-tags',
      'narrators',
      'authors',
      'frames',
      'meditations',
      'music',
      'lessons',
      'file-attachments',
      'external-videos',
      'pages',
      'forms',
      'form-submissions',
    ]

    console.log('\nCollection Statistics:')
    console.log('=====================')

    let totalDocs = 0
    const stats: { [key: string]: number } = {}

    // Get counts for each collection
    for (const collection of collections) {
      try {
        const result = await payload.count({ collection: collection as any })
        const count = result.totalDocs
        stats[collection] = count
        totalDocs += count

        if (count > 0) {
          console.log(`  ${collection}: ${count} documents`)
        }
      } catch (error) {
        // Collection might not exist or be accessible
        console.log(`  ${collection}: (not accessible)`)
      }
    }

    console.log(`\nTotal: ${totalDocs} documents across ${Object.keys(stats).length} collections`)

    // Check for import tags
    console.log('\nImport Tags:')
    console.log('============')

    const importTagCollections = ['media-tags', 'meditation-tags', 'music-tags', 'page-tags']
    let foundTags = false

    for (const tagCollection of importTagCollections) {
      try {
        const result = await payload.find({
          collection: tagCollection as any,
          where: {
            slug: {
              contains: 'import-',
            },
          },
          limit: 100,
        })

        if (result.docs.length > 0) {
          for (const tag of result.docs) {
            const tagData = tag as any
            const tagName = tagData.slug || tagData.title?.en || tagData.title || 'unknown'
            console.log(`  ✓ ${tagName} (${tagCollection})`)
            foundTags = true
          }
        }
      } catch (error) {
        // Collection might not exist
      }
    }

    if (!foundTags) {
      console.log('  (none found)')
    }

    // Check media with tags
    try {
      const mediaWithTags = await payload.find({
        collection: 'media',
        where: {
          tags: {
            exists: true,
          },
        },
        limit: 1000,
      })

      if (mediaWithTags.docs.length > 0) {
        console.log(`\nMedia with tags: ${mediaWithTags.docs.length}`)
      }
    } catch (error) {
      // Media collection might not exist or have tags
    }

    // Check lessons with import tags
    try {
      const lessonsWithImportTags = await payload.find({
        collection: 'lessons',
        where: {
          tags: {
            exists: true,
          },
        },
        limit: 1000,
      })

      if (lessonsWithImportTags.docs.length > 0) {
        console.log(`Lessons with tags: ${lessonsWithImportTags.docs.length}`)
      }
    } catch (error) {
      // Lessons collection might not exist or have tags
    }

  } catch (error) {
    console.error('❌ Error checking database:', error)
    throw error
  } finally {
    // Clean up Payload connection
    if (payload?.db?.destroy) {
      await payload.db.destroy()
    }
  }
}

checkDatabaseStats()
