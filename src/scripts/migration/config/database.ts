import { Client } from 'pg'
import type { MigrationConfig } from '../types'

export class DatabaseConnection {
  private client: Client | null = null

  constructor(private config: MigrationConfig['postgres']) {}

  async connect(): Promise<void> {
    this.client = new Client({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
    })

    try {
      await this.client.connect()
      console.log('✓ Connected to PostgreSQL database')
    } catch (error) {
      console.error('✗ Failed to connect to PostgreSQL:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end()
      console.log('✓ Disconnected from PostgreSQL database')
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.client) {
      throw new Error('Database not connected')
    }

    const result = await this.client.query(sql, params)
    return result.rows
  }

  async getTableData(tableName: string, limit?: number): Promise<any[]> {
    const sql = limit 
      ? `SELECT * FROM ${tableName} LIMIT $1`
      : `SELECT * FROM ${tableName}`
    
    return this.query(sql, limit ? [limit] : undefined)
  }

  async getTableCount(tableName: string): Promise<number> {
    const result = await this.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${tableName}`
    )
    return parseInt(result[0].count, 10)
  }
}

export function getConfigFromEnv(): MigrationConfig {
  return {
    postgres: {
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || '',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || '',
    },
    media: {
      baseUrl: process.env.MEDIA_BASE_URL || '',
    },
    options: {
      batchSize: parseInt(process.env.MIGRATION_BATCH_SIZE || '100', 10),
      dryRun: process.env.DRY_RUN === 'true',
    },
  }
}