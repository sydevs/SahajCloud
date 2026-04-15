/**
 * Playwright Global Setup
 *
 * Initializes the E2E test database and seeds required test data before tests run.
 * This ensures all E2E tests have access to:
 * - Default manager user for authentication
 * - Basic test data (narrators, meditations, frames) for UI testing
 *
 * The database is file-based SQLite, shared between this setup process
 * and the dev server that Playwright starts.
 */
/* eslint-disable no-console */
import type { FullConfig } from '@playwright/test'

import fs from 'fs'
import path from 'path'

import { getPayload } from 'payload'

import { e2ePayloadConfig, E2E_DATABASE_PATH } from '../config/e2e-payload.config'
import {
  E2E_CREDENTIALS,
  SAMPLE_FILES_DIR,
  createFileObject,
  createSeedStatus,
  type SeedStatus,
} from '../utils/e2e-helpers'

/**
 * Seed the default manager user for authentication
 */
async function seedDefaultManager(payload: Awaited<ReturnType<typeof getPayload>>) {
  // Check if default manager already exists
  const existing = await payload.find({
    collection: 'managers',
    where: {
      email: { equals: E2E_CREDENTIALS.email },
    },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    console.log('   Default manager already exists, skipping...')
    return existing.docs[0]
  }

  // Create default manager with admin privileges
  // Note: currentProject defaults to null (Sahaj Cloud/admin view)
  // _verified must be true to allow login (bypasses email verification)
  const manager = await payload.create({
    collection: 'managers',
    data: {
      email: E2E_CREDENTIALS.email,
      password: E2E_CREDENTIALS.password,
      name: E2E_CREDENTIALS.name,
      type: 'admin',
      _verified: true,
    },
  })

  console.log('   Created default manager:', manager.email)
  return manager
}

/**
 * Seed a narrator for meditation testing
 */
async function seedNarrator(payload: Awaited<ReturnType<typeof getPayload>>) {
  // Check if narrator already exists
  const existing = await payload.find({
    collection: 'narrators',
    where: {
      name: { equals: 'E2E Test Narrator' },
    },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    console.log('   Test narrator already exists, skipping...')
    return existing.docs[0]
  }

  const narrator = await payload.create({
    collection: 'narrators',
    data: {
      name: 'E2E Test Narrator',
      gender: 'male',
    },
  })

  console.log('   Created test narrator:', narrator.name)
  return narrator
}

/**
 * Seed a test image for thumbnails
 */
async function seedTestImage(payload: Awaited<ReturnType<typeof getPayload>>) {
  // Check if test image already exists
  const existing = await payload.find({
    collection: 'images',
    where: {
      alt: { equals: 'E2E Test Thumbnail' },
    },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    console.log('   Test image already exists, skipping...')
    return existing.docs[0]
  }

  // Read sample image file using shared utility
  const imagePath = path.join(SAMPLE_FILES_DIR, 'image-1050x700.jpg')
  const fileObject = createFileObject(imagePath, { name: 'e2e-test-thumbnail.jpg' })

  if (!fileObject) {
    console.log('   Sample image not found, skipping image seed...')
    return null
  }

  const image = await payload.create({
    collection: 'images',
    data: {
      alt: 'E2E Test Thumbnail',
    },
    file: fileObject,
  })

  console.log('   Created test image')
  return image
}

/**
 * Seed a test meditation with audio file
 */
async function seedTestMeditation(
  payload: Awaited<ReturnType<typeof getPayload>>,
  narratorId: number,
  thumbnailId: number,
) {
  // Check if test meditation already exists
  const existing = await payload.find({
    collection: 'meditations',
    where: {
      title: { equals: 'E2E Test Meditation' },
    },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    console.log('   Test meditation already exists, skipping...')
    return existing.docs[0]
  }

  // Read sample audio file using shared utility
  const audioPath = path.join(SAMPLE_FILES_DIR, 'audio-42s.mp3')
  const fileObject = createFileObject(audioPath, { name: 'e2e-test-meditation.mp3' })

  if (!fileObject) {
    console.log('   Sample audio not found, skipping meditation seed...')
    return null
  }

  const meditation = await payload.create({
    collection: 'meditations',
    data: {
      label: 'E2E Test Meditation',
      title: 'E2E Test Meditation',
      thumbnail: thumbnailId,
      narrator: narratorId,
      locale: 'en',
    },
    file: fileObject,
  })

  console.log('   Created test meditation:', meditation.title)
  return meditation
}

/**
 * Seed test frames for the meditation frame editor
 */
async function seedTestFrames(payload: Awaited<ReturnType<typeof getPayload>>) {
  // Check if test frames already exist
  const existing = await payload.find({
    collection: 'frames',
    where: {
      imageSet: { equals: 'male' },
    },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    console.log('   Test frames already exist, skipping...')
    return true
  }

  // Read sample image file for frames using shared utility
  const imagePath = path.join(SAMPLE_FILES_DIR, 'image-1050x700.jpg')

  // Create a few test frames (using valid category values from FRAME_CATEGORY_OPTIONS)
  const categories = ['mooladhara', 'swadhistan', 'nabhi'] as const
  let createdCount = 0

  for (const category of categories) {
    const fileObject = createFileObject(imagePath, { name: `e2e-frame-${category}.jpg` })

    if (!fileObject) {
      console.log('   Sample image not found, skipping frame seed...')
      return false
    }

    await payload.create({
      collection: 'frames',
      data: {
        imageSet: 'male',
        category,
      },
      file: fileObject,
    })
    createdCount++
  }

  console.log('   Created', createdCount, 'test frames')
  return true
}

/**
 * Main global setup function
 *
 * Uses SeedStatus tracking for better error recovery - if seeding fails partway through,
 * subsequent runs will only attempt to seed missing items.
 */
async function globalSetup(_config: FullConfig) {
  console.log('\n🧪 E2E Test Setup: Initializing database...')

  // Remove any stale E2E SQLite file (and sidecar journal/WAL/SHM files) before
  // initializing Payload. A stale schema on disk causes drizzle-kit push to
  // emit warnings and open an interactive prompt that hangs indefinitely in
  // Playwright's subprocess (no TTY). Starting fresh guarantees no warnings.
  console.log('🧹 Resetting E2E database to prevent drizzle push prompts...')
  for (const suffix of ['', '-journal', '-shm', '-wal']) {
    fs.rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true })
  }

  // Initialize Payload with E2E config
  console.log('   Database path:', E2E_DATABASE_PATH)
  const payload = await getPayload({ config: e2ePayloadConfig })

  console.log('\n📦 Seeding test data...')

  // Track seeding status for error recovery
  const status: SeedStatus = createSeedStatus()
  let hasErrors = false

  try {
    // Seed essential data - manager is always required
    const manager = await seedDefaultManager(payload)
    status.manager = !!manager

    // Seed narrator - independent, no dependencies
    const narrator = await seedNarrator(payload)
    status.narrator = !!narrator

    // Seed image - independent, no dependencies
    const image = await seedTestImage(payload)
    status.image = !!image

    // Seed meditation - depends on narrator and image
    if (status.narrator && status.image && narrator && image) {
      const meditation = await seedTestMeditation(payload, narrator.id, image.id)
      status.meditation = !!meditation
    } else {
      console.log('   Skipping meditation seed (missing narrator or image)')
    }

    // Seed frames - independent
    const framesResult = await seedTestFrames(payload)
    status.frames = framesResult

    // Report status
    const seededCount = Object.values(status).filter(Boolean).length
    const totalItems = Object.keys(status).length

    if (seededCount === totalItems) {
      console.log('\n✅ E2E database setup complete!\n')
    } else {
      console.log(`\n⚠️ E2E setup partially complete (${seededCount}/${totalItems} items seeded)`)
      console.log('   Status:', JSON.stringify(status, null, 2))
      hasErrors = true
    }
  } catch (error) {
    console.error('\n❌ E2E setup failed:', error)
    console.error('   Seed status at failure:', JSON.stringify(status, null, 2))
    throw error
  } finally {
    // Close database connection
    if (payload.db && typeof payload.db.destroy === 'function') {
      await payload.db.destroy()
    }
  }

  // Don't throw for partial success - tests may still be able to run
  if (hasErrors && !status.manager) {
    throw new Error('E2E setup failed: Manager user is required for authentication')
  }
}

export default globalSetup
