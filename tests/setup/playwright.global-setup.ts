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
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import type { FullConfig } from '@playwright/test'
import { getPayload } from 'payload'

import { e2ePayloadConfig, E2E_DATABASE_PATH } from '../config/e2e-payload.config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Default manager credentials (from CLAUDE.md)
const DEFAULT_MANAGER = {
  email: 'contact@sydevelopers.com',
  password: 'evk1VTH5dxz_nhg-mzk',
  name: 'E2E Test Admin',
}

// Path to sample test files
const SAMPLE_FILES_DIR = path.join(__dirname, '../files')

/**
 * Seed the default manager user for authentication
 */
async function seedDefaultManager(payload: Awaited<ReturnType<typeof getPayload>>) {
  // Check if default manager already exists
  const existing = await payload.find({
    collection: 'managers',
    where: {
      email: { equals: DEFAULT_MANAGER.email },
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
      email: DEFAULT_MANAGER.email,
      password: DEFAULT_MANAGER.password,
      name: DEFAULT_MANAGER.name,
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

  // Read sample image file
  const imagePath = path.join(SAMPLE_FILES_DIR, 'image-1050x700.jpg')
  if (!fs.existsSync(imagePath)) {
    console.log('   Sample image not found, skipping image seed...')
    return null
  }

  const fileBuffer = fs.readFileSync(imagePath)
  const fileData = new Uint8Array(fileBuffer)

  const image = await payload.create({
    collection: 'images',
    data: {
      alt: 'E2E Test Thumbnail',
    },
    file: {
      data: fileData as unknown as Buffer,
      mimetype: 'image/jpeg',
      name: 'e2e-test-thumbnail.jpg',
      size: fileData.length,
    },
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

  // Read sample audio file
  const audioPath = path.join(SAMPLE_FILES_DIR, 'audio-42s.mp3')
  if (!fs.existsSync(audioPath)) {
    console.log('   Sample audio not found, skipping meditation seed...')
    return null
  }

  const fileBuffer = fs.readFileSync(audioPath)
  const fileData = new Uint8Array(fileBuffer)

  const meditation = await payload.create({
    collection: 'meditations',
    data: {
      label: 'E2E Test Meditation',
      title: 'E2E Test Meditation',
      durationMinutes: 1,
      thumbnail: thumbnailId,
      narrator: narratorId,
      locale: 'en',
    },
    file: {
      data: fileData as unknown as Buffer,
      mimetype: 'audio/mpeg',
      name: 'e2e-test-meditation.mp3',
      size: fileData.length,
    },
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
    return
  }

  // Read sample image file for frames
  const imagePath = path.join(SAMPLE_FILES_DIR, 'image-1050x700.jpg')
  if (!fs.existsSync(imagePath)) {
    console.log('   Sample image not found, skipping frame seed...')
    return
  }

  const fileBuffer = fs.readFileSync(imagePath)
  const fileData = new Uint8Array(fileBuffer)

  // Create a few test frames (using valid category values from FRAME_CATEGORY_OPTIONS)
  const categories = ['mooladhara', 'swadhistan', 'nabhi'] as const
  for (const category of categories) {
    await payload.create({
      collection: 'frames',
      data: {
        imageSet: 'male',
        category,
      },
      file: {
        data: fileData as unknown as Buffer,
        mimetype: 'image/jpeg',
        name: `e2e-frame-${category}.jpg`,
        size: fileData.length,
      },
    })
  }

  console.log('   Created', categories.length, 'test frames')
}

/**
 * Main global setup function
 */
async function globalSetup(_config: FullConfig) {
  console.log('\n🧪 E2E Test Setup: Initializing database...')

  // Remove existing database for clean start (optional - uncomment for fresh DB each run)
  // if (fs.existsSync(E2E_DATABASE_PATH)) {
  //   console.log('   Removing existing E2E database...')
  //   fs.unlinkSync(E2E_DATABASE_PATH)
  // }

  // Initialize Payload with E2E config
  console.log('   Database path:', E2E_DATABASE_PATH)
  const payload = await getPayload({ config: e2ePayloadConfig })

  console.log('\n📦 Seeding test data...')

  try {
    // Seed essential data
    await seedDefaultManager(payload)

    // Seed test data for meditation frame editor tests
    const narrator = await seedNarrator(payload)
    const image = await seedTestImage(payload)

    if (narrator && image) {
      await seedTestMeditation(payload, narrator.id, image.id)
    }

    await seedTestFrames(payload)

    console.log('\n✅ E2E database setup complete!\n')
  } catch (error) {
    console.error('\n❌ E2E setup failed:', error)
    throw error
  } finally {
    // Close database connection
    if (payload.db && typeof payload.db.destroy === 'function') {
      await payload.db.destroy()
    }
  }
}

export default globalSetup
