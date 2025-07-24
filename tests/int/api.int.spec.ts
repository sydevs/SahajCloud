import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import type { User, Tag, Narrator } from '@/payload-types'
import { createTestEnvironment } from '../utils/testHelpers'

describe('REST API', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let serverURL: string
  let authToken: string
  let testUser: User

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    serverURL = payload.config.serverURL || 'http://localhost:3000'

    // Create a test user for authentication
    testUser = await payload.create({
      collection: 'users',
      data: {
        email: 'api-test@example.com',
        password: 'ApiTest123!',
      },
    }) as User

    // Login to get auth token
    const loginResult = await payload.login({
      collection: 'users',
      data: {
        email: 'api-test@example.com',
        password: 'ApiTest123!',
      },
    })
    authToken = loginResult.token || ''
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Collections CRUD Operations', () => {
    describe('Tags', () => {
      it('creates a tag via REST API', async () => {
        const newTag = await fetch(`${serverURL}/api/tags`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `JWT ${authToken}`,
          },
          body: JSON.stringify({
            title: 'Test Tag',
            slug: 'test-tag',
          }),
        }).then(res => res.json())

        expect(newTag.doc).toBeDefined()
        expect(newTag.doc.title).toBe('Test Tag')
        expect(newTag.doc.slug).toBe('test-tag')
      })

      it('gets all tags via REST API', async () => {
        // Create a few tags first
        await payload.create({
          collection: 'tags',
          data: { title: 'Tag 1', slug: 'tag-1' },
        })
        await payload.create({
          collection: 'tags',
          data: { title: 'Tag 2', slug: 'tag-2' },
        })

        const response = await fetch(`${serverURL}/api/tags`, {
          headers: {
            'Authorization': `JWT ${authToken}`,
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
          data: { title: 'Single Tag', slug: 'single-tag' },
        }) as Tag

        const response = await fetch(`${serverURL}/api/tags/${tag.id}`, {
          headers: {
            'Authorization': `JWT ${authToken}`,
          },
        }).then(res => res.json())

        expect(response.id).toBe(tag.id)
        expect(response.title).toBe('Single Tag')
        expect(response.slug).toBe('single-tag')
      })

      it('updates a tag via REST API', async () => {
        const tag = await payload.create({
          collection: 'tags',
          data: { title: 'Original Title', slug: 'original-slug' },
        }) as Tag

        const updatedTag = await fetch(`${serverURL}/api/tags/${tag.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `JWT ${authToken}`,
          },
          body: JSON.stringify({
            title: 'Updated Title',
          }),
        }).then(res => res.json())

        expect(updatedTag.doc.title).toBe('Updated Title')
        expect(updatedTag.doc.slug).toBe('original-slug') // Slug shouldn't change
      })

      it('deletes a tag via REST API', async () => {
        const tag = await payload.create({
          collection: 'tags',
          data: { title: 'To Delete', slug: 'to-delete' },
        }) as Tag

        const deleteResponse = await fetch(`${serverURL}/api/tags/${tag.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `JWT ${authToken}`,
          },
        })

        expect(deleteResponse.ok).toBe(true)

        // Verify it's deleted
        const getResponse = await fetch(`${serverURL}/api/tags/${tag.id}`, {
          headers: {
            'Authorization': `JWT ${authToken}`,
          },
        })
        expect(getResponse.status).toBe(404)
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
            'Authorization': `JWT ${authToken}`,
          },
        }).then(res => res.json())

        expect(page1.docs).toHaveLength(2)
        expect(page1.page).toBe(1)
        expect(page1.totalPages).toBeGreaterThanOrEqual(2)

        const page2 = await fetch(`${serverURL}/api/narrators?limit=2&page=2`, {
          headers: {
            'Authorization': `JWT ${authToken}`,
          },
        }).then(res => res.json())

        expect(page2.docs).toHaveLength(2)
        expect(page2.page).toBe(2)
        expect(page2.docs[0].id).not.toBe(page1.docs[0].id)
      })

      it('supports filtering via REST API', async () => {
        const femaleNarrators = await fetch(`${serverURL}/api/narrators?where[gender][equals]=female`, {
          headers: {
            'Authorization': `JWT ${authToken}`,
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
            'Authorization': `JWT ${authToken}`,
          },
        }).then(res => res.json())

        for (let i = 1; i < sortedAsc.docs.length; i++) {
          expect(sortedAsc.docs[i].name.localeCompare(sortedAsc.docs[i-1].name)).toBeGreaterThanOrEqual(0)
        }

        const sortedDesc = await fetch(`${serverURL}/api/narrators?sort=-name`, {
          headers: {
            'Authorization': `JWT ${authToken}`,
          },
        }).then(res => res.json())

        for (let i = 1; i < sortedDesc.docs.length; i++) {
          expect(sortedDesc.docs[i].name.localeCompare(sortedDesc.docs[i-1].name)).toBeLessThanOrEqual(0)
        }
      })
    })

    describe('Authentication', () => {
      it('requires authentication for protected endpoints', async () => {
        const response = await fetch(`${serverURL}/api/users`, {
          // No auth header
        })

        expect(response.status).toBe(401)
      })

      it('allows access with valid authentication', async () => {
        const response = await fetch(`${serverURL}/api/users`, {
          headers: {
            'Authorization': `JWT ${authToken}`,
          },
        })

        expect(response.ok).toBe(true)
        const data = await response.json()
        expect(data.docs).toBeDefined()
      })
    })

    describe('Error Handling', () => {
      it('returns 404 for non-existent resources', async () => {
        const response = await fetch(`${serverURL}/api/tags/nonexistentid`, {
          headers: {
            'Authorization': `JWT ${authToken}`,
          },
        })

        expect(response.status).toBe(404)
      })

      it('returns 400 for invalid data', async () => {
        const response = await fetch(`${serverURL}/api/narrators`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `JWT ${authToken}`,
          },
          body: JSON.stringify({
            // Missing required fields
            gender: 'invalid-gender',
          }),
        })

        expect(response.status).toBe(400)
        const error = await response.json()
        expect(error.errors).toBeDefined()
      })
    })
  })
})
