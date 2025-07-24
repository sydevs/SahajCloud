#!/usr/bin/env tsx

/**
 * Example of using the Payload CMS REST API with API Key authentication
 * 
 * Usage:
 * API_KEY="your-api-key-here" pnpm tsx src/scripts/api-examples/rest-api-example.ts
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api'
const API_KEY = process.env.API_KEY || 'your-api-key-here'

// API Key authentication doesn't require login, just pass the key in headers

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
  private apiKey: string

  constructor(baseURL: string, apiKey: string) {
    this.baseURL = baseURL
    this.apiKey = apiKey
  }

  // API Key authentication is handled via headers, no login required

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `clients API-Key ${this.apiKey}`,
    }
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
  const client = new PayloadAPIClient(API_BASE_URL, API_KEY)

  try {
    console.log('🔑 Using API Key authentication')
    console.log('📝 Note: API clients have read-only access')

    // 2. Get all tags
    console.log('\n📋 Fetching all tags...')
    const tags = await client.get<PaginatedResponse<any>>('/tags')
    console.log(`Found ${tags.totalDocs} tags`)
    tags.docs.slice(0, 3).forEach(tag => {
      console.log(`  - ${tag.title} (${tag.slug})`)
    })

    // 3. Demonstrate read-only access
    console.log('\n🚫 Attempting to create a tag (should fail - read only)...')
    try {
      await client.post('/tags', {
        title: 'API Test Tag',
      })
    } catch (_error) {
      console.log('✅ Create operation blocked as expected (read-only access)')
    }

    // 4. Demonstrate update is blocked
    console.log('\n🚫 Update operations are not allowed for API clients')

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

    // 8. Delete operations not allowed
    console.log('\n🚫 Delete operations are not allowed for API clients')

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