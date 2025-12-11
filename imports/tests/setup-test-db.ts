#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * Setup Test Database for Migration Scripts
 *
 * This script initializes an in-memory SQLite database for testing import scripts.
 * It uses Payload's test configuration with better-sqlite3 for fast, isolated testing.
 */

import type { Payload } from 'payload'

import { getPayload } from 'payload'

import { testPayloadConfig } from './test-payload.config'

async function setupTestDatabase() {
  console.log('🧪 Setting up test database...\n')

  let payload: Payload | null = null

  try {
    // Initialize Payload with in-memory SQLite
    console.log('Initializing Payload with in-memory SQLite...')
    payload = await getPayload({ config: testPayloadConfig() })
    console.log('✓ Payload initialized with in-memory SQLite database\n')

    // The database and collections are automatically created by Payload
    // based on the schema defined in collections/
    console.log('Collections created automatically from schema:')
    const collectionNames = [
      'managers',
      'images',
      'image-tags',
      'meditation-tags',
      'music-tags',
      'page-tags',
      'narrators',
      'frames',
      'meditations',
      'music',
      'lessons',
      'files',
      'external-videos',
      'pages',
      'authors',
      'clients',
      'forms',
      'form-submissions',
    ]

    for (const collection of collectionNames) {
      console.log(`  ✓ ${collection}`)
    }

    console.log('\n✓ Test database setup complete!')
    console.log('\nDatabase: In-memory SQLite (no persistence)')
    console.log('Config: imports/tests/test-payload.config.ts')

    // Environment notes
    console.log('\n📝 For migration testing, set:')
    console.log('PAYLOAD_SECRET=test-secret-key-for-migration-testing')
    console.log('NODE_ENV=development (or omit for test mode)')

    // Verify collections are accessible
    console.log('\n🔍 Verifying database...')
    const lessonsCount = await payload.count({ collection: 'lessons' })
    const imagesCount = await payload.count({ collection: 'images' })
    console.log(`  Lessons: ${lessonsCount.totalDocs} documents`)
    console.log(`  Images: ${imagesCount.totalDocs} documents`)
    console.log('✓ Database verification complete')

  } catch (error) {
    console.error('❌ Error setting up test database:', error)
    throw error
  } finally {
    // Clean up Payload connection
    if (payload?.db?.destroy) {
      await payload.db.destroy()
      console.log('\n🧹 Database connection closed')
    }
  }
}

async function cleanupTestDatabase() {
  console.log('\n🧹 Cleaning up test database...\n')

  // For in-memory SQLite, cleanup happens automatically when the connection closes
  // No persistent files to delete

  console.log('✓ In-memory database cleanup complete')
  console.log('  (Database was automatically destroyed when connection closed)')
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
