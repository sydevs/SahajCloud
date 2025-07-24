import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import type { Client, Tag, Narrator, User } from '@/payload-types'
import { createTestEnvironment } from '../utils/testHelpers'

describe('REST API with API Key Authentication', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let serverURL: string
  let apiKey: string
  let testClient: Client

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    serverURL = payload.config.serverURL || 'http://localhost:3000'

    // Create a test admin user to manage the client
    const adminUser = await payload.create({
      collection: 'users',
      data: {
        email: 'test-admin@example.com',
        password: 'AdminPass123!',
      },
    }) as User

    // Create a test client
    testClient = await payload.create({
      collection: 'clients',
      data: {
        name: 'Test API Client',
        email: 'test-client@example.com',
        description: 'Test client for API integration tests',
        role: 'full-access',
        active: true,
        contacts: [adminUser.id],
      },
    }) as Client

    // Note: In a real environment, API keys are generated through the admin UI
    // For testing purposes, we'll use a mock API key
    // The actual API key generation is handled by Payload's auth system
    apiKey = 'test-api-key-123'
    
    // TODO: Implement proper API key generation for tests once we understand
    // how Payload handles this internally
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Collections CRUD Operations', () => {
    describe('Tags', () => {
      it('prevents creating a tag via REST API (read-only access)', async () => {
        const response = await fetch(`${serverURL}/api/tags`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `clients API-Key ${apiKey}`,
          },
          body: JSON.stringify({
            title: 'Test Tag',
          }),
        })

        // Clients have read-only access, so create should fail
        expect(response.ok).toBe(false)
        expect(response.status).toBe(403) // Forbidden
      })

      it('gets all tags via REST API', async () => {
        // Create a few tags first
        await payload.create({
          collection: 'tags',
          data: { title: 'Tag 1' },
        })
        await payload.create({
          collection: 'tags',
          data: { title: 'Tag 2' },
        })

        const response = await fetch(`${serverURL}/api/tags`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        }).then(res => res.json())

        expect(response.docs).toBeDefined()
        expect(response.docs.length).toBeGreaterThanOrEqual(2)
        expect(response.totalDocs).toBeGreaterThanOrEqual(2)
        expect(response.page).toBe(1)
      })

      it('gets a single tag by ID via REST API', async () => {
        const tag = await payload.create({
          collection: 'tags',
          data: { title: 'Single Tag' },
        }) as Tag

        const response = await fetch(`${serverURL}/api/tags/${tag.id}`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        }).then(res => res.json())

        expect(response.id).toBe(tag.id)
        expect(response.title).toBe('Single Tag')
      })

      it('prevents updating a tag via REST API (read-only access)', async () => {
        const tag = await payload.create({
          collection: 'tags',
          data: { title: 'Original Title' },
        }) as Tag

        const response = await fetch(`${serverURL}/api/tags/${tag.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `clients API-Key ${apiKey}`,
          },
          body: JSON.stringify({
            title: 'Updated Title',
          }),
        })

        // Clients have read-only access, so update should fail
        expect(response.ok).toBe(false)
        expect(response.status).toBe(403) // Forbidden
      })

      it('prevents deleting a tag via REST API (read-only access)', async () => {
        const tag = await payload.create({
          collection: 'tags',
          data: { title: 'To Delete' },
        }) as Tag

        const deleteResponse = await fetch(`${serverURL}/api/tags/${tag.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        })

        // Clients have read-only access, so delete should fail
        expect(deleteResponse.ok).toBe(false)
        expect(deleteResponse.status).toBe(403) // Forbidden

        // Verify tag still exists
        const getResponse = await fetch(`${serverURL}/api/tags/${tag.id}`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        })
        expect(getResponse.ok).toBe(true)
        const tag2 = await getResponse.json()
        expect(tag2.id).toBe(tag.id)
      })
    })

    describe('Query Parameters', () => {
      beforeAll(async () => {
        // Create test data
        for (let i = 1; i <= 5; i++) {
          await payload.create({
            collection: 'narrators',
            data: { 
              name: `Narrator ${i}`, 
              gender: i % 2 === 0 ? 'female' : 'male',
              slug: `narrator-${i}`,
            },
          })
        }
      })

      it('supports pagination via REST API', async () => {
        const page1 = await fetch(`${serverURL}/api/narrators?limit=2&page=1`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        }).then(res => res.json())

        expect(page1.docs).toHaveLength(2)
        expect(page1.page).toBe(1)
        expect(page1.totalPages).toBeGreaterThanOrEqual(2)

        const page2 = await fetch(`${serverURL}/api/narrators?limit=2&page=2`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        }).then(res => res.json())

        expect(page2.docs).toHaveLength(2)
        expect(page2.page).toBe(2)
        expect(page2.docs[0].id).not.toBe(page1.docs[0].id)
      })

      it('supports filtering via REST API', async () => {
        const femaleNarrators = await fetch(`${serverURL}/api/narrators?where[gender][equals]=female`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        }).then(res => res.json())

        expect(femaleNarrators.docs.length).toBeGreaterThanOrEqual(2)
        femaleNarrators.docs.forEach((narrator: Narrator) => {
          expect(narrator.gender).toBe('female')
        })
      })

      it('supports sorting via REST API', async () => {
        const sortedAsc = await fetch(`${serverURL}/api/narrators?sort=name`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        }).then(res => res.json())

        for (let i = 1; i < sortedAsc.docs.length; i++) {
          expect(sortedAsc.docs[i].name.localeCompare(sortedAsc.docs[i-1].name)).toBeGreaterThanOrEqual(0)
        }

        const sortedDesc = await fetch(`${serverURL}/api/narrators?sort=-name`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        }).then(res => res.json())

        for (let i = 1; i < sortedDesc.docs.length; i++) {
          expect(sortedDesc.docs[i].name.localeCompare(sortedDesc.docs[i-1].name)).toBeLessThanOrEqual(0)
        }
      })
    })

    describe('Authentication', () => {
      it('requires authentication for protected endpoints', async () => {
        const response = await fetch(`${serverURL}/api/tags`, {
          // No auth header
        })

        expect(response.status).toBe(401)
      })

      it('allows access with valid API key authentication', async () => {
        const response = await fetch(`${serverURL}/api/tags`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        })

        expect(response.ok).toBe(true)
        const data = await response.json()
        expect(data.docs).toBeDefined()
      })

      it('prevents access to users collection with API key (clients cannot access users)', async () => {
        const response = await fetch(`${serverURL}/api/users`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        })

        // Clients should not have access to users collection
        expect(response.ok).toBe(false)
        expect(response.status).toBe(403) // Forbidden
      })
    })

    describe('Error Handling', () => {
      it('returns 404 for non-existent resources', async () => {
        const response = await fetch(`${serverURL}/api/tags/nonexistentid`, {
          headers: {
            'Authorization': `clients API-Key ${apiKey}`,
          },
        })

        expect(response.status).toBe(404)
      })

      it('prevents creating resources with invalid data (read-only access)', async () => {
        const response = await fetch(`${serverURL}/api/narrators`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `clients API-Key ${apiKey}`,
          },
          body: JSON.stringify({
            // Missing required fields
            gender: 'invalid-gender',
          }),
        })

        // Clients have read-only access, so create should fail with 403, not 400
        expect(response.status).toBe(403) // Forbidden due to read-only access
      })
    })
  })
})
