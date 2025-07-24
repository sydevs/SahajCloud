#!/usr/bin/env tsx

/**
 * Example of using the Payload CMS REST API from an external client
 * 
 * Usage:
 * pnpm tsx src/scripts/api-examples/rest-api-example.ts
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api'
const API_EMAIL = process.env.API_EMAIL || 'contact@sydevelopers.com'
const API_PASSWORD = process.env.API_PASSWORD || 'evk1VTH5dxz_nhg-mzk'

interface AuthResponse {
  token: string
  user: any
  exp: number
}

interface PaginatedResponse<T> {
  docs: T[]
  totalDocs: number
  page: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

class PayloadAPIClient {
  private baseURL: string
  private authToken: string | null = null

  constructor(baseURL: string) {
    this.baseURL = baseURL
  }

  async authenticate(email: string, password: string): Promise<void> {
    console.log('🔐 Authenticating...')
    
    const response = await fetch(`${this.baseURL}/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`)
    }

    const data: AuthResponse = await response.json()
    this.authToken = data.token
    console.log('✅ Authentication successful')
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (this.authToken) {
      headers['Authorization'] = `JWT ${this.authToken}`
    }

    return headers
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`GET ${endpoint} failed: ${response.statusText}`)
    }

    return response.json()
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`POST ${endpoint} failed: ${JSON.stringify(error)}`)
    }

    return response.json()
  }

  async patch<T>(endpoint: string, data: any): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`PATCH ${endpoint} failed: ${response.statusText}`)
    }

    return response.json()
  }

  async delete(endpoint: string): Promise<void> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      throw new Error(`DELETE ${endpoint} failed: ${response.statusText}`)
    }
  }
}

async function demonstrateAPIUsage() {
  const client = new PayloadAPIClient(API_BASE_URL)

  try {
    // 1. Authenticate
    await client.authenticate(API_EMAIL, API_PASSWORD)

    // 2. Get all tags
    console.log('\n📋 Fetching all tags...')
    const tags = await client.get<PaginatedResponse<any>>('/tags')
    console.log(`Found ${tags.totalDocs} tags`)
    tags.docs.slice(0, 3).forEach(tag => {
      console.log(`  - ${tag.title} (${tag.slug})`)
    })

    // 3. Create a new tag
    console.log('\n➕ Creating a new tag...')
    const newTag = await client.post<{ doc: any }>('/tags', {
      title: 'API Test Tag',
      slug: 'api-test-tag',
    })
    console.log(`Created tag: ${newTag.doc.title} (ID: ${newTag.doc.id})`)

    // 4. Update the tag
    console.log('\n✏️  Updating the tag...')
    const updatedTag = await client.patch<{ doc: any }>(`/tags/${newTag.doc.id}`, {
      title: 'Updated API Test Tag',
    })
    console.log(`Updated tag title: ${updatedTag.doc.title}`)

    // 5. Get narrators with filtering
    console.log('\n👥 Fetching male narrators...')
    const maleNarrators = await client.get<PaginatedResponse<any>>(
      '/narrators?where[gender][equals]=male'
    )
    console.log(`Found ${maleNarrators.totalDocs} male narrators`)

    // 6. Pagination example
    console.log('\n📄 Demonstrating pagination...')
    const page1 = await client.get<PaginatedResponse<any>>('/tags?limit=2&page=1')
    console.log(`Page 1: ${page1.docs.length} items, hasNextPage: ${page1.hasNextPage}`)
    
    if (page1.hasNextPage) {
      const page2 = await client.get<PaginatedResponse<any>>('/tags?limit=2&page=2')
      console.log(`Page 2: ${page2.docs.length} items, hasPrevPage: ${page2.hasPrevPage}`)
    }

    // 7. Sorting example
    console.log('\n🔤 Fetching tags sorted by title...')
    const sortedTags = await client.get<PaginatedResponse<any>>('/tags?sort=title&limit=5')
    console.log('Sorted tags:')
    sortedTags.docs.forEach(tag => {
      console.log(`  - ${tag.title}`)
    })

    // 8. Clean up - delete the test tag
    console.log('\n🗑️  Cleaning up...')
    await client.delete(`/tags/${newTag.doc.id}`)
    console.log('Test tag deleted')

    console.log('\n✅ API demonstration completed successfully!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateAPIUsage()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}