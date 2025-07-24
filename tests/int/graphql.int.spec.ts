import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Payload } from 'payload'
import type { User, Tag, Narrator } from '@/payload-types'
import { createTestEnvironment } from '../utils/testHelpers'

describe('GraphQL API', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let serverURL: string
  let authToken: string

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    serverURL = payload.config.serverURL || 'http://localhost:3000'

    // Create a test user for authentication
    await payload.create({
      collection: 'users',
      data: {
        email: 'graphql-test@example.com',
        password: 'GraphQL123!',
      },
    })

    // Login to get auth token
    const loginResult = await payload.login({
      collection: 'users',
      data: {
        email: 'graphql-test@example.com',
        password: 'GraphQL123!',
      },
    })
    authToken = loginResult.token || ''
  })

  afterAll(async () => {
    await cleanup()
  })

  const graphqlRequest = async (query: string, variables?: Record<string, any>) => {
    const response = await fetch(`${serverURL}/api/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `JWT ${authToken}`,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    })
    return response.json()
  }

  describe('Query Operations', () => {
    beforeAll(async () => {
      // Create test data
      await payload.create({
        collection: 'tags',
        data: { title: 'GraphQL Tag 1', slug: 'graphql-tag-1' },
      })
      await payload.create({
        collection: 'tags',
        data: { title: 'GraphQL Tag 2', slug: 'graphql-tag-2' },
      })
      await payload.create({
        collection: 'narrators',
        data: { name: 'GraphQL Narrator', gender: 'male', slug: 'graphql-narrator' },
      })
    })

    it('queries all tags', async () => {
      const query = `
        query GetTags {
          Tags {
            docs {
              id
              title
              slug
            }
            totalDocs
          }
        }
      `

      const result = await graphqlRequest(query)
      
      expect(result.errors).toBeUndefined()
      expect(result.data.Tags).toBeDefined()
      expect(result.data.Tags.docs).toBeInstanceOf(Array)
      expect(result.data.Tags.totalDocs).toBeGreaterThanOrEqual(2)
      
      const graphqlTags = result.data.Tags.docs.filter((tag: Tag) => 
        tag.title.startsWith('GraphQL Tag')
      )
      expect(graphqlTags).toHaveLength(2)
    })

    it('queries a single tag by ID', async () => {
      const tag = await payload.create({
        collection: 'tags',
        data: { title: 'Single GraphQL Tag', slug: 'single-graphql-tag' },
      }) as Tag

      const query = `
        query GetTag($id: String!) {
          Tag(id: $id) {
            id
            title
            slug
          }
        }
      `

      const result = await graphqlRequest(query, { id: tag.id })
      
      expect(result.errors).toBeUndefined()
      expect(result.data.Tag).toBeDefined()
      expect(result.data.Tag.id).toBe(tag.id)
      expect(result.data.Tag.title).toBe('Single GraphQL Tag')
      expect(result.data.Tag.slug).toBe('single-graphql-tag')
    })

    it('queries with pagination', async () => {
      const query = `
        query GetPaginatedTags($limit: Int!, $page: Int!) {
          Tags(limit: $limit, page: $page) {
            docs {
              id
              title
            }
            totalDocs
            page
            totalPages
            hasNextPage
            hasPrevPage
          }
        }
      `

      const result = await graphqlRequest(query, { limit: 1, page: 1 })
      
      expect(result.errors).toBeUndefined()
      expect(result.data.Tags.docs).toHaveLength(1)
      expect(result.data.Tags.page).toBe(1)
      expect(result.data.Tags.totalPages).toBeGreaterThanOrEqual(2)
      expect(result.data.Tags.hasNextPage).toBe(true)
      expect(result.data.Tags.hasPrevPage).toBe(false)
    })

    it('queries with filtering', async () => {
      const query = `
        query GetNarratorsByGender($gender: Narrator_gender_Input!) {
          Narrators(where: { gender: { equals: $gender } }) {
            docs {
              id
              name
              gender
            }
          }
        }
      `

      const result = await graphqlRequest(query, { gender: 'male' })
      
      expect(result.errors).toBeUndefined()
      expect(result.data.Narrators.docs).toBeInstanceOf(Array)
      result.data.Narrators.docs.forEach((narrator: Narrator) => {
        expect(narrator.gender).toBe('male')
      })
    })

    it('queries with sorting', async () => {
      const query = `
        query GetSortedTags {
          Tags(sort: "title") {
            docs {
              title
            }
          }
        }
      `

      const result = await graphqlRequest(query)
      
      expect(result.errors).toBeUndefined()
      const titles = result.data.Tags.docs.map((tag: Tag) => tag.title)
      
      for (let i = 1; i < titles.length; i++) {
        expect(titles[i].localeCompare(titles[i-1])).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('Mutation Operations', () => {
    it('creates a tag via GraphQL', async () => {
      const mutation = `
        mutation CreateTag($title: String!, $slug: String!) {
          createTag(data: { title: $title, slug: $slug }) {
            id
            title
            slug
          }
        }
      `

      const result = await graphqlRequest(mutation, {
        title: 'Mutation Tag',
        slug: 'mutation-tag',
      })
      
      expect(result.errors).toBeUndefined()
      expect(result.data.createTag).toBeDefined()
      expect(result.data.createTag.title).toBe('Mutation Tag')
      expect(result.data.createTag.slug).toBe('mutation-tag')
    })

    it('updates a tag via GraphQL', async () => {
      const tag = await payload.create({
        collection: 'tags',
        data: { title: 'Original', slug: 'original' },
      }) as Tag

      const mutation = `
        mutation UpdateTag($id: String!, $title: String!) {
          updateTag(id: $id, data: { title: $title }) {
            id
            title
            slug
          }
        }
      `

      const result = await graphqlRequest(mutation, {
        id: tag.id,
        title: 'Updated via GraphQL',
      })
      
      expect(result.errors).toBeUndefined()
      expect(result.data.updateTag.id).toBe(tag.id)
      expect(result.data.updateTag.title).toBe('Updated via GraphQL')
      expect(result.data.updateTag.slug).toBe('original') // Slug should remain unchanged
    })

    it('deletes a tag via GraphQL', async () => {
      const tag = await payload.create({
        collection: 'tags',
        data: { title: 'To Delete', slug: 'to-delete' },
      }) as Tag

      const mutation = `
        mutation DeleteTag($id: String!) {
          deleteTag(id: $id) {
            id
          }
        }
      `

      const result = await graphqlRequest(mutation, { id: tag.id })
      
      expect(result.errors).toBeUndefined()
      expect(result.data.deleteTag.id).toBe(tag.id)

      // Verify deletion
      const verifyQuery = `
        query VerifyDeleted($id: String!) {
          Tag(id: $id) {
            id
          }
        }
      `
      
      const verifyResult = await graphqlRequest(verifyQuery, { id: tag.id })
      expect(verifyResult.data.Tag).toBeNull()
    })
  })

  describe('Error Handling', () => {
    it('returns errors for invalid queries', async () => {
      const query = `
        query InvalidQuery {
          NonExistentCollection {
            id
          }
        }
      `

      const result = await graphqlRequest(query)
      
      expect(result.errors).toBeDefined()
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('returns errors for unauthorized access', async () => {
      // Make request without auth token
      const response = await fetch(`${serverURL}/api/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query {
              Users {
                docs {
                  id
                  email
                }
              }
            }
          `,
        }),
      })
      
      const result = await response.json()
      expect(result.errors).toBeDefined()
    })

    it('validates input data in mutations', async () => {
      const mutation = `
        mutation CreateInvalidNarrator {
          createNarrator(data: { name: "", gender: "invalid" }) {
            id
          }
        }
      `

      const result = await graphqlRequest(mutation)
      
      expect(result.errors).toBeDefined()
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Complex Queries', () => {
    it('queries with nested relationships', async () => {
      // Create related data
      const tag1 = await payload.create({
        collection: 'tags',
        data: { title: 'Relation Tag 1', slug: 'relation-tag-1' },
      }) as Tag
      
      const tag2 = await payload.create({
        collection: 'tags',
        data: { title: 'Relation Tag 2', slug: 'relation-tag-2' },
      }) as Tag

      const query = `
        query GetTagsWithCount {
          Tags {
            docs {
              id
              title
              meditations {
                totalDocs
              }
              music {
                totalDocs
              }
            }
          }
        }
      `

      const result = await graphqlRequest(query)
      
      expect(result.errors).toBeUndefined()
      expect(result.data.Tags.docs).toBeInstanceOf(Array)
      
      result.data.Tags.docs.forEach((tag: any) => {
        expect(tag).toHaveProperty('meditations')
        expect(tag).toHaveProperty('music')
        expect(tag.meditations).toHaveProperty('totalDocs')
        expect(tag.music).toHaveProperty('totalDocs')
      })
    })

    it('uses fragments for reusable fields', async () => {
      const query = `
        fragment TagFields on Tag {
          id
          title
          slug
          createdAt
          updatedAt
        }

        query GetTagsWithFragment {
          Tags(limit: 2) {
            docs {
              ...TagFields
            }
          }
        }
      `

      const result = await graphqlRequest(query)
      
      expect(result.errors).toBeUndefined()
      expect(result.data.Tags.docs).toBeInstanceOf(Array)
      
      result.data.Tags.docs.forEach((tag: any) => {
        expect(tag).toHaveProperty('id')
        expect(tag).toHaveProperty('title')
        expect(tag).toHaveProperty('slug')
        expect(tag).toHaveProperty('createdAt')
        expect(tag).toHaveProperty('updatedAt')
      })
    })
  })
})