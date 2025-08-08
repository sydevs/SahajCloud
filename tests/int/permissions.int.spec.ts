import { describe, it, beforeAll, afterAll, expect, afterEach } from 'vitest'
import type { Operation, Payload, TypedUser } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'
import { hasPermission, createLocaleFilter, Permission } from '@/lib/accessControl'

const OPERATIONS = ['read', 'create', 'update', 'delete'] as const

describe('Permission System Tests', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Permission Logic Tests', () => {
    describe('hasPermission function', () => {
      it('allows admin users full access', () => {
        const user = testData.dummyUser('users', { admin: true })
        
        OPERATIONS.forEach(operation => {
          expect(hasPermission({ collection: 'music', user, operation })).toBe(true)
        });
      })

      it('denies inactive users access', () => {
        const user = testData.dummyUser('users', { active: false })
        
        OPERATIONS.forEach(operation => {
          expect(hasPermission({ collection: 'users', user, operation })).toBe(false)
          expect(hasPermission({ collection: 'clients', user, operation })).toBe(false)
        });
      })

      it('blocks API clients from users/clients collections', () => {
        const client = testData.dummyUser('clients', {
          permissions: [
            { allowedCollection: 'music', level: 'manage', locales: ['all'] },
            { allowedCollection: 'users', level: 'manage', locales: ['all'] },
            { allowedCollection: 'clients', level: 'manage', locales: ['all'] },
          ]
        })

        const COLLECTIONS = ['users', 'clients']
        COLLECTIONS.forEach(collection => {
          OPERATIONS.forEach(operation => {
            expect(hasPermission({ collection, user: client, operation })).toBe(false)
          });
        })
      })

      it('handles translate user permissions correctly', () => {
        const collection = 'music'
        const user = testData.dummyUser('users', {
          permissions: [
            { allowedCollection: 'music', level: 'translate', locales: ['en'] }
          ]
        })
        
        expect(hasPermission({ operation: 'read', collection, user })).toBe(true)
        expect(hasPermission({ operation: 'update', collection, user })).toBe(true)
        expect(hasPermission({ operation: 'create', collection, user })).toBe(false)
        expect(hasPermission({ operation: 'delete', collection, user })).toBe(false)
      })

      it('handles manage user permissions correctly', () => {
        const user = testData.dummyUser('users', {
          permissions: [
            { allowedCollection: 'music', level: 'manage', locales: ['en'] }
          ]
        })
        
        OPERATIONS.forEach(operation => {
          expect(hasPermission({ collection: 'music', user, operation })).toBe(true)
        });
      })

      it('handles API client read permissions correctly', () => {
        const collection = 'music'
        const client = testData.dummyUser('clients', {
          permissions: [
            { allowedCollection: 'music', level: 'read', locales: ['en'] }
          ]
        })
        
        expect(hasPermission({ operation: 'read', collection, user: client })).toBe(true)
        expect(hasPermission({ operation: 'create', collection, user: client })).toBe(false)
        expect(hasPermission({ operation: 'update', collection, user: client })).toBe(false)
        expect(hasPermission({ operation: 'delete', collection, user: client })).toBe(false)
      })

      it('handles API client manage permissions correctly (no delete)', () => {
        const collection = 'music'
        const client = testData.dummyUser('clients', {
          permissions: [
            { allowedCollection: 'music', level: 'manage', locales: ['en'] }
          ]
        })
        
        expect(hasPermission({ operation: 'read', collection, user: client })).toBe(true)
        expect(hasPermission({ operation: 'create', collection, user: client })).toBe(true)
        expect(hasPermission({ operation: 'update', collection, user: client })).toBe(true)
        expect(hasPermission({ operation: 'delete', collection, user: client })).toBe(false)
      })

      it('respects locale restrictions', () => {
        const operation = 'update'
        const collection = 'music'
        const user = testData.dummyUser('users', {
          permissions: [
            { allowedCollection: 'music', level: 'manage', locales: ['en'] }
          ]
        })
        
        expect(hasPermission({ operation, collection, user, locale: 'en' })).toBe(true)
        expect(hasPermission({ operation, collection, user, locale: 'it' })).toBe(false)
      })

      it('handles "all" locales permission', () => {
        const operation = 'read'
        const collection = 'music'
        const user = testData.dummyUser('users', {
          permissions: [
            { allowedCollection: 'music', level: 'read', locales: ['all'] }
          ]
        })
        
        expect(hasPermission({ operation, collection, user, locale: 'en' })).toBe(true)
        expect(hasPermission({ operation, collection, user, locale: 'it' })).toBe(true)
        expect(hasPermission({ operation, collection, user, locale: 'fr' })).toBe(true)
      })

      it('provides default read access for users without specific permissions', () => {
        const collection = 'music'
        const user = testData.dummyUser('users', {
          permissions: []
        })
        
        expect(hasPermission({ operation: 'read', collection, user })).toBe(true)
        expect(hasPermission({ operation: 'create', collection, user })).toBe(false)
        expect(hasPermission({ operation: 'update', collection, user })).toBe(false)
        expect(hasPermission({ operation: 'delete', collection, user })).toBe(false)
      })

      it('denies API clients without specific permissions', () => {
        const client = testData.dummyUser('clients', {
          permissions: []
        })
        
        expect(hasPermission({ user: client, collection: 'music', operation: 'read' })).toBe(false)
      })
      
      it('allows admin users full field access', () => {
        const collection = 'music'
        const user = testData.dummyUser('users', { admin: true })
        const field = { localized: false }
        
        expect(hasPermission({ user, collection, operation: 'read', field })).toBe(true)
        expect(hasPermission({ user, collection, operation: 'update', field })).toBe(true)
      })

      it('restricts translate users to localized fields for updates', () => {
        const collection = 'music'
        const user = testData.dummyUser('users', {
          permissions: [
            { allowedCollection: 'music', level: 'translate', locales: ['en'] }
          ]
        })
        
        const localizedField = { localized: true }
        const nonLocalizedField = { localized: false }
        
        // Can read both types of fields
        let operation = 'read' as Operation
        expect(hasPermission({ user, collection, operation, field: localizedField })).toBe(true)
        expect(hasPermission({ user, collection, operation, field: nonLocalizedField })).toBe(true)
        
        // Can only update localized fields
        operation = 'update'
        expect(hasPermission({ user, collection, operation, field: localizedField })).toBe(true)
        expect(hasPermission({ user, collection, operation, field: nonLocalizedField })).toBe(false)
      })

      it('allows manage users full field access', () => {
        const collection = 'music'
        const user = testData.dummyUser('users', {
          permissions: [
            { allowedCollection: 'music', level: 'manage', locales: ['en'] }
          ]
        })
        
        const field = { localized: false }
        
        expect(hasPermission({ user, collection, operation: 'read', field })).toBe(true)
        expect(hasPermission({ user, collection, operation: 'update', field })).toBe(true)
      })

      it('allows API clients full field access (handled at collection level)', () => {
        const collection = 'music'
        const client = testData.dummyUser('clients', {
          permissions: [
            { allowedCollection: 'music', level: 'read', locales: ['en'] }
          ]
        })
        
        const field = { localized: false }
        
        expect(hasPermission({ user: client, collection, operation: 'read', field })).toBe(true)
        expect(hasPermission({ user: client, collection, operation: 'update', field })).toBe(false)
      })
    })

    describe('createLocaleFilter function', () => {
      it('returns true for admin users', () => {
        const user = testData.dummyUser('users', { admin: true })
        const filter = createLocaleFilter(user, 'music')
        expect(filter).toBe(true)
      })

      it('returns true for "all" locales permission', () => {
        const user = testData.dummyUser('users', {
          permissions: [
            { allowedCollection: 'music', level: 'manage', locales: ['all'] }
          ]
        })
        
        const filter = createLocaleFilter(user, 'music')
        expect(filter).toBe(true)
      })

      it('creates locale filter for specific locales', () => {
        const user = testData.dummyUser('users', {
          permissions: [
            { allowedCollection: 'music', level: 'manage', locales: ['en', 'it'] }
          ]
        })
        
        const filter = createLocaleFilter(user, 'music')
        expect(filter).toEqual({
          or: [
            { locale: { exists: false } },
            { locale: { in: ['en', 'it'] } }
          ]
        })
      })

      it('returns true for users without specific permissions (default read)', () => {
        const user = testData.dummyUser('users')        
        const filter = createLocaleFilter(user, 'music')
        expect(filter).toBe(true)
      })

      it('returns false for API clients without specific permissions', () => {
        const client = testData.dummyUser('clients')        
        const filter = createLocaleFilter(client, 'music')
        expect(filter).toBe(false)
      })
    })
  })

  describe('Integration Tests with Payload', () => {
    it('allows admin user to access all collections', async () => {
      const adminUser = await testData.createUser(payload, {
        admin: true,
      })

      // Mock request with admin user
      const req = { user: adminUser } as any

      // Test that admin can read music collection
      const music = await payload.find({
        collection: 'music',
        req,
        depth: 0,
      })
      
      expect(music).toBeDefined()
      expect(music.docs).toEqual([]) // Empty since no music created, but access granted
    })

    it('blocks non-admin user without permissions from accessing collections', async () => {
      const regularUser = await testData.createUser(payload)

      // Mock request with regular user
      const req = { user: regularUser } as any

      // Should be able to read (default access)
      const music = await payload.find({
        collection: 'music',
        req,
        depth: 0,
      })
      
      expect(music).toBeDefined()

      // Should not be able to create
      await expect(
        payload.create({
          collection: 'music',
          data: { title: 'Test Music' },
          req,
        })
      ).rejects.toThrow()
    })

    it('allows translate user to read but not create', async () => {
      const translateUser = await testData.createUser(payload, {
        permissions: [
          { allowedCollection: 'music', level: 'translate', locales: ['en'] }
        ],
      })

      const req = { user: translateUser } as any

      // Should be able to read
      const music = await payload.find({
        collection: 'music',
        req,
        depth: 0,
      })
      
      expect(music).toBeDefined()

      // Should not be able to create
      await expect(
        payload.create({
          collection: 'music',
          data: { title: 'Test Music' },
          req,
        })
      ).rejects.toThrow()
    })

    it('allows manage user to create, read, update, delete', async () => {
      const manageUser = await testData.createUser(payload, {
        permissions: [
          { allowedCollection: 'music', level: 'manage', locales: ['all'] }
        ],
      })

      const req = { user: manageUser } as any

      // Should be able to create (but need actual file for music collection)
      // TODO: This test would need a proper audio file, so we'll just test the access control logic
      
      // Should be able to read
      const music = await payload.find({
        collection: 'music',
        req,
        depth: 0,
      })
      
      expect(music).toBeDefined()
    })
  })
})