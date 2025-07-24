#!/usr/bin/env tsx

/**
 * Example of using the Payload CMS GraphQL API from an external client
 * 
 * Usage:
 * pnpm tsx src/scripts/api-examples/graphql-api-example.ts
 */

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || 'http://localhost:3000/api/graphql'
const API_EMAIL = process.env.API_EMAIL || 'contact@sydevelopers.com'
const API_PASSWORD = process.env.API_PASSWORD || 'evk1VTH5dxz_nhg-mzk'

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{
    message: string
    extensions?: any
  }>
}

class PayloadGraphQLClient {
  private endpoint: string
  private authToken: string | null = null

  constructor(endpoint: string) {
    this.endpoint = endpoint
  }

  async authenticate(email: string, password: string): Promise<void> {
    console.log('🔐 Authenticating...')
    
    const mutation = `
      mutation Login($email: String!, $password: String!) {
        loginUser(email: $email, password: $password) {
          token
          user {
            id
            email
          }
        }
      }
    `

    const response = await this.query<{
      loginUser: { token: string; user: { id: string; email: string } }
    }>(mutation, { email, password })

    if (response.errors) {
      throw new Error(`Authentication failed: ${response.errors[0].message}`)
    }

    this.authToken = response.data!.loginUser.token
    console.log('✅ Authentication successful')
  }

  async query<T>(query: string, variables?: Record<string, any>): Promise<GraphQLResponse<T>> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (this.authToken) {
      headers['Authorization'] = `JWT ${this.authToken}`
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables,
      }),
    })

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`)
    }

    return response.json()
  }
}

async function demonstrateGraphQLUsage() {
  const client = new PayloadGraphQLClient(GRAPHQL_ENDPOINT)

  try {
    // 1. Authenticate
    await client.authenticate(API_EMAIL, API_PASSWORD)

    // 2. Query all tags
    console.log('\n📋 Fetching all tags...')
    const tagsQuery = `
      query GetTags {
        Tags {
          docs {
            id
            title
            slug
            createdAt
          }
          totalDocs
        }
      }
    `
    const tagsResponse = await client.query<{
      Tags: { docs: any[]; totalDocs: number }
    }>(tagsQuery)
    
    if (tagsResponse.data) {
      console.log(`Found ${tagsResponse.data.Tags.totalDocs} tags`)
      tagsResponse.data.Tags.docs.slice(0, 3).forEach(tag => {
        console.log(`  - ${tag.title} (${tag.slug})`)
      })
    }

    // 3. Create a new tag
    console.log('\n➕ Creating a new tag...')
    const createMutation = `
      mutation CreateTag($title: String!, $slug: String!) {
        createTag(data: { title: $title, slug: $slug }) {
          id
          title
          slug
        }
      }
    `
    const createResponse = await client.query<{
      createTag: { id: string; title: string; slug: string }
    }>(createMutation, {
      title: 'GraphQL Test Tag',
      slug: 'graphql-test-tag',
    })

    if (createResponse.data) {
      const newTag = createResponse.data.createTag
      console.log(`Created tag: ${newTag.title} (ID: ${newTag.id})`)

      // 4. Update the tag
      console.log('\n✏️  Updating the tag...')
      const updateMutation = `
        mutation UpdateTag($id: String!, $title: String!) {
          updateTag(id: $id, data: { title: $title }) {
            id
            title
            slug
          }
        }
      `
      const updateResponse = await client.query<{
        updateTag: { id: string; title: string; slug: string }
      }>(updateMutation, {
        id: newTag.id,
        title: 'Updated GraphQL Test Tag',
      })

      if (updateResponse.data) {
        console.log(`Updated tag title: ${updateResponse.data.updateTag.title}`)
      }

      // 5. Query with filtering
      console.log('\n👥 Fetching male narrators...')
      const narratorsQuery = `
        query GetMaleNarrators {
          Narrators(where: { gender: { equals: male } }) {
            docs {
              id
              name
              gender
            }
            totalDocs
          }
        }
      `
      const narratorsResponse = await client.query<{
        Narrators: { docs: any[]; totalDocs: number }
      }>(narratorsQuery)

      if (narratorsResponse.data) {
        console.log(`Found ${narratorsResponse.data.Narrators.totalDocs} male narrators`)
      }

      // 6. Complex query with relationships
      console.log('\n🔗 Fetching tags with relationship counts...')
      const complexQuery = `
        query GetTagsWithCounts {
          Tags(limit: 3) {
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
      const complexResponse = await client.query<{
        Tags: { docs: any[] }
      }>(complexQuery)

      if (complexResponse.data) {
        console.log('Tags with relationship counts:')
        complexResponse.data.Tags.docs.forEach(tag => {
          console.log(`  - ${tag.title}: ${tag.meditations.totalDocs} meditations, ${tag.music.totalDocs} music tracks`)
        })
      }

      // 7. Using fragments
      console.log('\n📄 Using GraphQL fragments...')
      const fragmentQuery = `
        fragment TagFields on Tag {
          id
          title
          slug
          createdAt
          updatedAt
        }

        query GetTagsWithFragment {
          Tags(limit: 2, sort: "-createdAt") {
            docs {
              ...TagFields
            }
          }
        }
      `
      const fragmentResponse = await client.query<{
        Tags: { docs: any[] }
      }>(fragmentQuery)

      if (fragmentResponse.data) {
        console.log('Recent tags:')
        fragmentResponse.data.Tags.docs.forEach(tag => {
          console.log(`  - ${tag.title} (created: ${new Date(tag.createdAt).toLocaleDateString()})`)
        })
      }

      // 8. Clean up - delete the test tag
      console.log('\n🗑️  Cleaning up...')
      const deleteMutation = `
        mutation DeleteTag($id: String!) {
          deleteTag(id: $id) {
            id
          }
        }
      `
      await client.query(deleteMutation, { id: newTag.id })
      console.log('Test tag deleted')
    }

    console.log('\n✅ GraphQL API demonstration completed successfully!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateGraphQLUsage()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}