import type { TableSchema, ColumnInfo, ForeignKeyInfo } from '../types'
import type { DatabaseConnection } from '../config/database'

export class SchemaAnalyzer {
  constructor(private db: DatabaseConnection) {}

  async analyzeTable(tableName: string): Promise<TableSchema> {
    const [columns, primaryKey, foreignKeys] = await Promise.all([
      this.getTableColumns(tableName),
      this.getPrimaryKey(tableName),
      this.getForeignKeys(tableName),
    ])

    return {
      tableName,
      columns,
      primaryKey,
      foreignKeys,
    }
  }

  private async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    const query = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `

    const results = await this.db.query<{
      column_name: string
      data_type: string
      is_nullable: string
      column_default: string | null
      character_maximum_length: number | null
    }>(query, [tableName])

    return results.map(row => ({
      columnName: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === 'YES',
      defaultValue: row.column_default || undefined,
      maxLength: row.character_maximum_length || undefined,
    }))
  }

  private async getPrimaryKey(tableName: string): Promise<string[]> {
    const query = `
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass
        AND i.indisprimary
    `

    const results = await this.db.query<{ column_name: string }>(query, [tableName])
    return results.map(row => row.column_name)
  }

  private async getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    const query = `
      SELECT
        kcu.column_name,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1
    `

    const results = await this.db.query<{
      column_name: string
      referenced_table: string
      referenced_column: string
    }>(query, [tableName])

    return results.map(row => ({
      columnName: row.column_name,
      referencedTable: row.referenced_table,
      referencedColumn: row.referenced_column,
    }))
  }

  async getTables(): Promise<string[]> {
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `

    const results = await this.db.query<{ table_name: string }>(query)
    return results.map(row => row.table_name)
  }

  async analyzeTables(tableNames: string[]): Promise<TableSchema[]> {
    const schemas: TableSchema[] = []
    
    for (const tableName of tableNames) {
      try {
        const schema = await this.analyzeTable(tableName)
        schemas.push(schema)
      } catch (error) {
        console.error(`Failed to analyze table ${tableName}:`, error)
      }
    }

    return schemas
  }

  printTableSchema(schema: TableSchema): void {
    console.log(`\n=== Table: ${schema.tableName} ===`)
    console.log(`Primary Key: ${schema.primaryKey.join(', ') || 'none'}`)
    
    console.log('\nColumns:')
    schema.columns.forEach(col => {
      const nullable = col.isNullable ? 'NULL' : 'NOT NULL'
      const length = col.maxLength ? `(${col.maxLength})` : ''
      const defaultVal = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : ''
      console.log(`  - ${col.columnName}: ${col.dataType}${length} ${nullable}${defaultVal}`)
    })

    if (schema.foreignKeys.length > 0) {
      console.log('\nForeign Keys:')
      schema.foreignKeys.forEach(fk => {
        console.log(`  - ${fk.columnName} -> ${fk.referencedTable}.${fk.referencedColumn}`)
      })
    }
  }
}