import { MongoMemoryServer } from 'mongodb-memory-server'

let mongoServer: MongoMemoryServer

export async function setup() {
  console.log('🚀 Starting MongoDB Memory Server...')
  
  mongoServer = await MongoMemoryServer.create({
    binary: {
      version: '7.0.0', // Use a stable MongoDB version
    },
    instance: {
      dbName: 'test-db',
    },
  })

  const mongoUri = mongoServer.getUri()
  console.log(`📦 MongoDB Memory Server started at: ${mongoUri}`)
  
  // Make the URI available globally
  process.env.TEST_MONGO_URI = mongoUri
}

export async function teardown() {
  console.log('🛑 Stopping MongoDB Memory Server...')
  
  if (mongoServer) {
    await mongoServer.stop()
    console.log('✅ MongoDB Memory Server stopped')
  }
}