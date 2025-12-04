#!/usr/bin/env node
/**
 * Seed script to create the first admin user using Payload Local API
 * This bypasses REST API access control
 *
 * Run with: npx tsx seed-admin.mjs
 */

import { getPayload } from 'payload'
import config from './src/payload.config.ts'

async function seedAdmin() {
  console.log('🌱 Seeding admin user...')

  try {
    // Get Payload instance
    const payload = await getPayload({ config })

    // Check if any managers exist
    const existingManagers = await payload.count({
      collection: 'managers',
    })

    if (existingManagers.totalDocs > 0) {
      console.log('✅ Admin user already exists, skipping seed')
      process.exit(0)
    }

    // Create admin user
    const admin = await payload.create({
      collection: 'managers',
      data: {
        email: 'test@sydevelopers.com',
        password: 'TestPassword123!',
        admin: true,
      },
    })

    console.log('✅ Admin user created successfully!')
    console.log(`   Email: ${admin.email}`)
    console.log(`   ID: ${admin.id}`)
    console.log(`   Admin: ${admin.admin}`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Error seeding admin user:', error)
    process.exit(1)
  }
}

seedAdmin()
