#!/usr/bin/env tsx

/**
 * Check Database Statistics
 *
 * Shows the document counts in the test database
 */

import { MongoClient } from 'mongodb'

const TEST_DB_NAME = 'sy_devs_cms_migration_test'
const TEST_DB_URI = `mongodb://localhost:27017/${TEST_DB_NAME}`

async function checkDatabaseStats() {
  const client = new MongoClient(TEST_DB_URI)

  try {
    await client.connect()
    const db = client.db(TEST_DB_NAME)

    const collections = await db.listCollections().toArray()

    console.log('\nCollection Statistics:')
    console.log('=====================')

    let totalDocs = 0

    for (const collInfo of collections) {
      const collection = db.collection(collInfo.name)
      const count = await collection.countDocuments()
      totalDocs += count

      if (count > 0) {
        console.log(`  ${collInfo.name}: ${count} documents`)
      }
    }

    console.log(`\nTotal: ${totalDocs} documents across ${collections.length} collections`)

    // Check for import tags
    console.log('\nImport Tags:')
    console.log('============')
    const mediaTags = db.collection('media-tags')
    const importTags = await mediaTags
      .find({ 'name.en': { $regex: /^import-/ } })
      .toArray()

    if (importTags.length > 0) {
      for (const tag of importTags) {
        const tagName = typeof tag.name === 'string' ? tag.name : tag.name?.en || tag.name
        console.log(`  ✓ ${tagName}`)
      }
    } else {
      console.log('  (none found)')
    }

    // Check media with import tags
    const media = db.collection('media')
    const mediaWithTags = await media.find({ tags: { $exists: true, $ne: [] } }).toArray()

    if (mediaWithTags.length > 0) {
      console.log(`\nMedia with tags: ${mediaWithTags.length}`)
    }
  } catch (error) {
    console.error('❌ Error checking database:', error)
    throw error
  } finally {
    await client.close()
  }
}

checkDatabaseStats()
