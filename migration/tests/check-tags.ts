#!/usr/bin/env tsx

import { MongoClient } from 'mongodb'

const TEST_DB_NAME = 'sy_devs_cms_migration_test'
const TEST_DB_URI = `mongodb://localhost:27017/${TEST_DB_NAME}`

async function checkTags() {
  const client = new MongoClient(TEST_DB_URI)

  try {
    await client.connect()
    const db = client.db(TEST_DB_NAME)

    console.log('\nAll Media Tags:')
    console.log('===============')
    const mediaTags = await db.collection('media-tags').find({}).toArray()
    console.log(JSON.stringify(mediaTags, null, 2))

    console.log('\n\nMedia documents with tags:')
    console.log('==========================')
    const mediaWithTags = await db
      .collection('media')
      .find({ tags: { $exists: true, $ne: [] } })
      .limit(3)
      .toArray()
    console.log(JSON.stringify(mediaWithTags, null, 2))
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await client.close()
  }
}

checkTags()
