#!/usr/bin/env tsx

/**
 * Setup Test Database for Migration Scripts
 *
 * This script creates a dummy MongoDB database for testing import scripts.
 * It generates test data and prepares the environment for script testing.
 */

import { MongoClient } from 'mongodb'

const TEST_DB_NAME = 'sy_devs_cms_migration_test'
const TEST_DB_URI = `mongodb://localhost:27017/${TEST_DB_NAME}`

async function setupTestDatabase() {
  console.log('🧪 Setting up test database...\n')

  const client = new MongoClient(TEST_DB_URI)

  try {
    await client.connect()
    console.log(`✓ Connected to MongoDB`)

    const db = client.db(TEST_DB_NAME)

    // Drop existing test database if it exists
    console.log(`Dropping existing database: ${TEST_DB_NAME}`)
    await db.dropDatabase()
    console.log(`✓ Database dropped\n`)

    // Create collections (they'll be created automatically when inserting)
    const collections = [
      'managers',
      'media',
      'media-tags',
      'meditation-tags',
      'music-tags',
      'page-tags',
      'narrators',
      'frames',
      'meditations',
      'music',
      'lessons',
      'file-attachments',
      'external-videos',
    ]

    console.log('Creating collections:')
    for (const collection of collections) {
      await db.createCollection(collection)
      console.log(`  ✓ ${collection}`)
    }

    console.log('\n✓ Test database setup complete!')
    console.log(`\nDatabase URI: ${TEST_DB_URI}`)
    console.log(`Database Name: ${TEST_DB_NAME}`)

    // Save environment for test scripts
    console.log('\n📝 Add to your .env.test file:')
    console.log(`TEST_DATABASE_URI=${TEST_DB_URI}`)
    console.log(`PAYLOAD_SECRET=test-secret-key-12345`)

  } catch (error) {
    console.error('❌ Error setting up test database:', error)
    throw error
  } finally {
    await client.close()
  }
}

async function cleanupTestDatabase() {
  console.log('\n🧹 Cleaning up test database...\n')

  const client = new MongoClient(TEST_DB_URI)

  try {
    await client.connect()
    const db = client.db(TEST_DB_NAME)
    await db.dropDatabase()
    console.log(`✓ Test database dropped: ${TEST_DB_NAME}`)
  } catch (error) {
    console.error('❌ Error cleaning up test database:', error)
  } finally {
    await client.close()
  }
}

// Main execution
const command = process.argv[2]

if (command === 'cleanup') {
  cleanupTestDatabase()
} else if (command === 'setup' || !command) {
  setupTestDatabase()
} else {
  console.error('Usage: tsx setup-test-db.ts [setup|cleanup]')
  process.exit(1)
}
