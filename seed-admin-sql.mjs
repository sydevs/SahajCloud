#!/usr/bin/env node
/**
 * Seed script to create the first admin user using direct SQL
 * Bypasses PayloadCMS schema checking and interactive prompts
 *
 * Run with: node seed-admin-sql.mjs
 */

import pg from 'pg'
import crypto from 'crypto'

const { Client } = pg

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

async function seedAdmin() {
  console.log('🌱 Seeding admin user via SQL...')

  const client = new Client({
    connectionString: process.env.DATABASE_URI || 'postgresql://localhost:5432/sy_devs_cms',
  })

  try {
    await client.connect()
    console.log('✓ Connected to database')

    // Check if managers table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'managers'
      );
    `)

    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  Managers table does not exist yet')
      console.log('   The production server needs to create the schema first')
      console.log('   Try accessing http://localhost:4567/admin in your browser')
      process.exit(1)
    }

    // Check if any managers exist
    const countResult = await client.query('SELECT COUNT(*) FROM managers')
    const count = parseInt(countResult.rows[0].count)

    if (count > 0) {
      console.log('✅ Admin user already exists, skipping seed')
      process.exit(0)
    }

    // Hash password
    const hashedPassword = await hashPassword('TestPassword123!')

    // Insert admin user
    const result = await client.query(
      `INSERT INTO managers (email, password, admin, "updatedAt", "createdAt")
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, email, admin`,
      ['test@sydevelopers.com', hashedPassword, true]
    )

    const admin = result.rows[0]
    console.log('✅ Admin user created successfully!')
    console.log(`   Email: ${admin.email}`)
    console.log(`   ID: ${admin.id}`)
    console.log(`   Admin: ${admin.admin}`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Error seeding admin user:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seedAdmin()
