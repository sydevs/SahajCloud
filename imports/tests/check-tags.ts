#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * Check Tags
 *
 * Shows tag data and tagged documents using Payload API.
 * Works with both SQLite (test) and D1 (production) databases.
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

    console.log('\nAll Image Tags:')
    console.log('===============')
    const imageTags = await payload.find({
      collection: 'image-tags',
      limit: 100,
    })
    console.log(JSON.stringify(imageTags.docs, null, 2))

    console.log('\n\nImage documents with tags:')
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
      collection: 'meditation-tags',
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
