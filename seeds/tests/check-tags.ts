#!/usr/bin/env tsx

/**
 * Check Tags
 *
 * Shows tag data and tagged documents using Payload API.
 * Works against the Postgres database.
 */

import type { Payload } from 'payload'

import { getPayload } from 'payload'

import configPromise from '../../src/payload.config'

async function checkTags() {
  let payload: Payload | null = null

  try {
    // Initialize Payload
    const config = await configPromise
    payload = await getPayload({ config })

    // Note: Image tags are now inline enum select values, not a separate collection
    // Showing images with tags instead

    console.log('\nImage documents with tags:')
    console.log('==========================')
    const imagesWithTags = await payload.find({
      collection: 'images',
      where: {
        tags: {
          exists: true,
        },
      },
      limit: 3,
    })
    console.log(JSON.stringify(imagesWithTags.docs, null, 2))

    // Also check meditation tags
    console.log('\n\nAll Meditation Tags:')
    console.log('====================')
    const meditationTags = await payload.find({
      collection: 'user-choices',
      limit: 100,
    })
    console.log(JSON.stringify(meditationTags.docs, null, 2))

    // Check lessons with tags (for storyblok import)
    console.log('\n\nLessons with tags:')
    console.log('==================')
    const lessonsWithTags = await payload.find({
      collection: 'lessons',
      where: {
        tags: {
          exists: true,
        },
      },
      limit: 3,
    })
    console.log(JSON.stringify(lessonsWithTags.docs, null, 2))
  } catch (error) {
    console.error('Error:', error)
  } finally {
    // Clean up Payload connection
    if (payload?.db?.destroy) {
      await payload.db.destroy()
    }
  }
}

checkTags()
