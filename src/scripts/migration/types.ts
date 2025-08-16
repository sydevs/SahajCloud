export interface TableSchema {
  tableName: string
  columns: ColumnInfo[]
  primaryKey: string[]
  foreignKeys: ForeignKeyInfo[]
}

export interface ColumnInfo {
  columnName: string
  dataType: string
  isNullable: boolean
  defaultValue?: string
  maxLength?: number
}

export interface ForeignKeyInfo {
  columnName: string
  referencedTable: string
  referencedColumn: string
}

export interface FieldMapping {
  sourceColumn: string
  targetField: string
  transform?: TransformFunction
  isRelationship?: boolean
  relationTo?: string
}

export type TransformFunction = (value: any, row?: any) => any

export interface MigrationConfig {
  postgres: {
    host: string
    port: number
    database: string
    user: string
    password: string
  }
  media: {
    baseUrl: string
  }
  options: {
    batchSize: number
    dryRun: boolean
  }
  mappings?: CollectionMappings
}

export interface CollectionMappings {
  tags?: FieldMapping[]
  music?: FieldMapping[]
  frames?: FieldMapping[]
  meditations?: FieldMapping[]
}

export interface MigrationResult {
  collection: string
  total: number
  success: number
  failed: number
  errors: MigrationError[]
  mediaTransferred?: number
  mediaSizeBytes?: number
}

export interface MigrationError {
  row: number
  message: string
  data?: any
}

export interface MigrationSummary {
  startTime: Date
  endTime: Date
  results: MigrationResult[]
  totalMediaTransferred: number
  totalMediaSizeBytes: number
}

export interface MediaUploadResult {
  id: string
  url: string
  filename: string
  mimeType: string
  filesize: number
}